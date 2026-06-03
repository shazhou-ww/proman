import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseReleaseArgs } from '../src/cli.ts'
import { type GitOps, type NpmRunner, release } from '../src/commands/release.ts'

const NOW = () => new Date('2026-06-02T00:00:00Z')

function makeGit(overrides: Partial<GitOps> = {}) {
  const calls: string[] = []
  let lastAuthor: string | undefined
  const base: GitOps = {
    getCurrentBranch: async () => 'main',
    isCleanTree: async () => true,
    branchExists: async () => false,
    checkoutNewBranch: async (n) => {
      calls.push(`checkoutNew ${n}`)
    },
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
  packageManager?: string
  access?: string
  multiPkg?: boolean
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const version = opts.version ?? '0.2.0'
  const packages = opts.multiPkg
    ? [
        { name: '@test/core', path: 'packages/core', type: 'lib' },
        { name: '@test/cli', path: 'packages/cli', type: 'cli' },
      ]
    : [{ name: '@test/core', path: 'packages/core', type: 'lib' }]

  const config: Record<string, unknown> = {
    name: 'test-project',
    runtime: 'node',
    packages,
  }
  if (opts.packageManager) config.packageManager = opts.packageManager
  if (opts.access) {
    config.release = { access: opts.access }
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
    const body = opts.changesetBody ?? '---\n"@test/core": minor\n---\nAdd feature X\n'
    await writeFile(join(csDir, 'add-feature.md'), body)
  }
}

let tmp: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'proman-release-'))
})

afterEach(async () => {
  await rm(tmp, { recursive: true })
})

// ── CLI arg parsing ──

describe('parseReleaseArgs', () => {
  test('--version', () => {
    const r = parseReleaseArgs(['--version', '1.0.0'])
    expect(r.version).toBe('1.0.0')
    expect(r.bump).toBeUndefined()
  })

  test('--bump patch', () => {
    const r = parseReleaseArgs(['--bump', 'patch'])
    expect(r.bump).toBe('patch')
    expect(r.version).toBeUndefined()
  })

  test('--force and --skip-tests', () => {
    const r = parseReleaseArgs(['--version', '1.0.0', '--force', '--skip-tests'])
    expect(r.force).toBe(true)
    expect(r.skipTests).toBe(true)
  })

  test('rejects --version + --bump', () => {
    expect(() => parseReleaseArgs(['--version', '1.0.0', '--bump', 'patch'])).toThrow(
      'mutually exclusive',
    )
  })

  test('rejects unknown flag', () => {
    expect(() => parseReleaseArgs(['--foo'])).toThrow('unknown flag')
  })

  test('rejects invalid --bump value', () => {
    expect(() => parseReleaseArgs(['--bump', 'huge'])).toThrow('must be major, minor, or patch')
  })
})

// ── Pre-flight checks ──

describe('release pre-flight', () => {
  test('rejects non-main branch', async () => {
    await setupFixture(tmp)
    const { git } = makeGit({ getCurrentBranch: async () => 'dev' })
    await expect(release({ cwd: tmp, git, version: '0.3.0' })).rejects.toThrow('must be on main')
  })

  test('rejects dirty tree', async () => {
    await setupFixture(tmp)
    const { git } = makeGit({ isCleanTree: async () => false })
    await expect(release({ cwd: tmp, git, version: '0.3.0' })).rejects.toThrow(
      'working tree must be clean',
    )
  })

  test('rejects no version and no changesets', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm } = makeNpm()
    await expect(release({ cwd: tmp, git, npm })).rejects.toThrow('no version specified')
  })
})

// ── Version bump ──

describe('version determination', () => {
  test('explicit --version', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    const pkg = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    expect(pkg.version).toBe('0.3.0')
    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest`)
  })

  test('explicit --bump patch', async () => {
    await setupFixture(tmp, { version: '1.2.3' })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, bump: 'patch', now: NOW })

    const pkg = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    expect(pkg.version).toBe('1.2.4')
  })

  test('auto-infer from changesets', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, now: NOW })

    const pkg = JSON.parse(await readFile(join(tmp, 'packages/core/package.json'), 'utf8'))
    expect(pkg.version).toBe('0.3.0') // minor bump from changeset
  })
})

// ── Build pipeline ──

describe('build pipeline', () => {
  test('runs install → build → test → check', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    const pipeline = calls.filter((c) => ['install', 'build', 'test', 'check'].includes(c))
    expect(pipeline).toEqual(['install', 'build', 'test', 'check'])
  })

  test('--skip-tests skips test step', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', skipTests: true, now: NOW })

    expect(calls).not.toContain('test')
    expect(calls).toContain('build')
    expect(calls).toContain('check')
  })
})

// ── Publish ──

describe('publish', () => {
  test('publishes with --tag latest for stable version', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest`)
  })

  test('publishes with --tag rc for rc version', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0-rc.1', now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=rc`)
  })

  test('passes access from config', async () => {
    await setupFixture(tmp, { access: 'public' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest access=public`)
  })

  test('multi-package publish in order', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

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
    await expect(release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })).rejects.toThrow(
      'publish failed for @test/cli',
    )
  })
})

// ── RC version ──

describe('rc versions', () => {
  test('skips changelog for rc', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0-rc.1', now: NOW })

    // Changeset files should still exist (not consumed for rc)
    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files).toContain('add-feature.md')
  })

  test('uses rc tag for publish', async () => {
    await setupFixture(tmp)
    const { git, calls: gitCalls } = makeGit()
    const { npm, calls } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '1.0.0-rc.1', now: NOW })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=rc`)
    expect(gitCalls).toContain('tag v1.0.0-rc.1')
  })
})

// ── Changelog ──

describe('changelog', () => {
  test('generates changelog and deletes changesets for stable release', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"@test/core": patch\n---\nFix bug Y\n',
    })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.2.1', now: NOW })

    const changelog = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('0.2.1')
    expect(changelog).toContain('2026-06-02')
    expect(changelog).toContain('Fix bug Y')

    // Changeset should be deleted
    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files.filter((f) => f.endsWith('.md') && f !== 'config.md')).toHaveLength(0)
  })

  test('no changelog if no changesets and no --force', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm } = makeNpm()
    // Should still succeed — just no changelog generated
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    const exists = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8').catch(
      () => null,
    )
    expect(exists).toBeNull()
  })
})

// ── Git operations ──

describe('git operations', () => {
  test('commits with author, tags, pushes', async () => {
    await setupFixture(tmp)
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    expect(calls).toContain('add')
    expect(calls).toContain('commit release: v0.3.0')
    expect(calls).toContain('tag v0.3.0')
    expect(calls).toContain('pushTags')
    expect(calls).toContain('push main')
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('does NOT create release branch', async () => {
    await setupFixture(tmp)
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.3.0', now: NOW })

    expect(calls.filter((c) => c.startsWith('checkoutNew'))).toHaveLength(0)
    expect(calls.filter((c) => c.startsWith('merge'))).toHaveLength(0)
  })

  test('custom git tag prefix', async () => {
    // Write config with custom prefix
    const { stringify } = await import('yaml')
    await writeFile(
      join(tmp, 'proman.yaml'),
      stringify({
        name: 'test',
        runtime: 'node',
        packages: [{ name: '@test/core', path: 'packages/core', type: 'lib' }],
        release: { gitTagPrefix: 'release-' },
      }),
    )
    await mkdir(join(tmp, 'packages/core'), { recursive: true })
    await writeFile(
      join(tmp, 'packages/core/package.json'),
      JSON.stringify({ name: '@test/core', version: '0.1.0' }, null, 2) + '\n',
    )

    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.2.0', now: NOW })

    expect(calls).toContain('tag release-0.2.0')
  })
})

// ── No workspace rewrite ──

describe('workspace deps preserved', () => {
  test('does NOT rewrite workspace:* in package.json', async () => {
    // Set up a multi-pkg fixture with workspace deps
    const { stringify } = await import('yaml')
    await writeFile(
      join(tmp, 'proman.yaml'),
      stringify({
        name: 'test',
        runtime: 'node',
        packages: [
          { name: '@test/core', path: 'packages/core', type: 'lib' },
          { name: '@test/cli', path: 'packages/cli', type: 'cli' },
        ],
      }),
    )
    await mkdir(join(tmp, 'packages/core'), { recursive: true })
    await mkdir(join(tmp, 'packages/cli'), { recursive: true })
    await writeFile(
      join(tmp, 'packages/core/package.json'),
      JSON.stringify({ name: '@test/core', version: '0.1.0' }, null, 2) + '\n',
    )
    await writeFile(
      join(tmp, 'packages/cli/package.json'),
      JSON.stringify(
        {
          name: '@test/cli',
          version: '0.1.0',
          dependencies: { '@test/core': 'workspace:*' },
        },
        null,
        2,
      ) + '\n',
    )

    const { git } = makeGit()
    const { npm } = makeNpm()
    await release({ cwd: tmp, git, npm, version: '0.2.0', now: NOW })

    // Version should be bumped but workspace:* should remain
    const cli = JSON.parse(await readFile(join(tmp, 'packages/cli/package.json'), 'utf8'))
    expect(cli.version).toBe('0.2.0')
    expect(cli.dependencies['@test/core']).toBe('workspace:*')
  })
})
