import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePublishArgs } from '../src/cli.ts'
import { type GitOps, type NpmRunner, publish } from '../src/commands/publish.ts'

const NOW = () => new Date('2026-06-02T00:00:00Z')

function makeGit(overrides: Partial<GitOps> = {}) {
  const calls: string[] = []
  let lastAuthor: string | undefined
  const base: GitOps = {
    getCurrentBranch: async () => 'main',
    isCleanTree: async () => true,
    branchExists: async () => false,
    checkoutNewBranch: async () => {},
    checkoutNewBranchFrom: async () => {},
    tagExists: async () => false,
    addAll: async () => {
      calls.push('add')
    },
    commit: async (m, a) => {
      calls.push(`commit ${m}`)
      lastAuthor = a
    },
    push: async (b) => {
      calls.push(`push ${b}`)
    },
    log: async () => '',
    tag: async (n) => {
      calls.push(`tag ${n}`)
    },
    pushTags: async () => {
      calls.push('pushTags')
    },
    checkout: async () => {},
    merge: async () => {},
    deleteBranchLocal: async () => {},
    deleteBranchRemote: async () => {},
  }
  return { git: { ...base, ...overrides } as GitOps, calls, getAuthor: () => lastAuthor }
}

function makeNpm(overrides: Partial<NpmRunner> = {}) {
  const calls: string[] = []
  const base: NpmRunner = {
    install: async () => {
      calls.push('install')
    },
    build: async () => {
      calls.push('build')
    },
    test: async () => {
      calls.push('test')
    },
    check: async () => {
      calls.push('check')
    },
    format: async () => {
      calls.push('format')
    },
    publish: async (dir, o) => {
      calls.push(`publish ${dir} tag=${o.tag}${o.access ? ` access=${o.access}` : ''}`)
    },
  }
  return { npm: { ...base, ...overrides } as NpmRunner, calls }
}

type FixtureOptions = {
  version?: string
  withChangeset?: boolean
  changesetBody?: string
  access?: string
  multiPkg?: boolean
  gitTagPrefix?: string
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const version = opts.version ?? '0.3.0'
  const packages = opts.multiPkg
    ? [
        { name: '@test/core', path: 'packages/core', type: 'lib' },
        { name: '@test/cli', path: 'packages/cli', type: 'cli' },
      ]
    : [{ name: '@test/core', path: 'packages/core', type: 'lib' }]

  const config: Record<string, unknown> = {
    packages,
  }
  if (opts.access || opts.gitTagPrefix) {
    const release: Record<string, string> = {}
    if (opts.access) release.access = opts.access
    if (opts.gitTagPrefix) release.gitTagPrefix = opts.gitTagPrefix
    config.release = release
  }

  const { stringify } = await import('yaml')
  await writeFile(join(tmp, 'proman.yaml'), stringify(config))

  for (const pkg of packages) {
    const dir = join(tmp, pkg.path)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: pkg.name, version }, null, 2) + '\n',
    )
  }

  if (opts.withChangeset) {
    const csDir = join(tmp, '.changeset')
    await mkdir(csDir, { recursive: true })
    const body = opts.changesetBody ?? '---\n"@test/core": patch\n---\nFix bug Y\n'
    await writeFile(join(csDir, 'add-feature.md'), body)
  }
}

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'proman-publish-'))
})

afterEach(async () => {
  await rm(tmp, { recursive: true })
})

// ── CLI arg parsing ──

describe('parsePublishArgs', () => {
  test('no args', () => {
    const r = parsePublishArgs([])
    expect(r.skipTests).toBe(false)
  })

  test('--skip-tests', () => {
    const r = parsePublishArgs(['--skip-tests'])
    expect(r.skipTests).toBe(true)
  })

  test('rejects unknown flag', () => {
    expect(() => parsePublishArgs(['--foo'])).toThrow('unknown flag')
  })
})

// ── Build pipeline ──

describe('build pipeline', () => {
  test('runs install → build → test → check', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    const pipeline = calls.filter((c) => ['install', 'build', 'test', 'check'].includes(c))
    expect(pipeline).toEqual(['install', 'build', 'test', 'check'])
  })

  test('--skip-tests skips test step', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, skipTests: true, now: NOW })

    expect(calls).not.toContain('test')
    expect(calls).toContain('build')
    expect(calls).toContain('check')
  })
})

// ── Publish ──

describe('publish packages', () => {
  test('publishes with --tag latest for stable version', async () => {
    await setupFixture(tmp, { version: '0.3.0' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest`)
  })

  test('publishes with --tag rc for rc version', async () => {
    await setupFixture(tmp, { version: '0.3.0-rc.1' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=rc`)
  })

  test('passes access from config', async () => {
    await setupFixture(tmp, { access: 'public' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest access=public`)
  })

  test('multi-package publish in order', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    const publishes = calls.filter((c) => c.startsWith('publish'))
    expect(publishes).toHaveLength(2)
    expect(publishes[0]).toContain('packages/core')
    expect(publishes[1]).toContain('packages/cli')
  })

  test('publish failure reports partial progress', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const { npm } = makeNpm({
      publish: async (dir) => {
        if (dir.includes('cli')) throw new Error('auth failed')
      },
    })
    await expect(publish({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(
      'publish failed for @test/cli',
    )
  })
})

// ── RC version ──

describe('rc versions', () => {
  test('skips changelog for rc', async () => {
    await setupFixture(tmp, { version: '0.3.0-rc.1', withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files).toContain('add-feature.md')
  })

  test('uses rc tag for git tag', async () => {
    await setupFixture(tmp, { version: '1.0.0-rc.1' })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain('tag v1.0.0-rc.1')
  })
})

// ── Changelog ──

describe('changelog', () => {
  test('generates changelog and deletes changesets for stable release', async () => {
    await setupFixture(tmp, { version: '0.2.1', withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    const changelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('0.2.1')
    expect(changelog).toContain('2026-06-02')
    expect(changelog).toContain('Fix bug Y')

    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files.filter((f) => f.endsWith('.md') && f !== 'config.md')).toHaveLength(0)
  })

  test('no changelog if no changesets', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    const exists = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8').catch(
      () => null,
    )
    expect(exists).toBeNull()
  })
})

// ── Git operations ──

describe('git operations', () => {
  test('commits with author, tags, pushes', async () => {
    await setupFixture(tmp, { version: '0.3.0' })
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain('add')
    expect(calls).toContain('commit release: v0.3.0')
    expect(calls).toContain('tag v0.3.0')
    expect(calls).toContain('pushTags')
    expect(calls).toContain('push main')
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('custom git tag prefix', async () => {
    await setupFixture(tmp, { version: '0.2.0', gitTagPrefix: 'release-' })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm, now: NOW })

    expect(calls).toContain('tag release-0.2.0')
  })
})
