import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { type GitOps, type NpmRunner, publish } from '../src/commands/publish.ts'
import type { SpawnFn } from '../src/utils/npm.ts'

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
  privatePkg?: boolean | 'pkgjson-only' | 'yaml-only'
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const version = opts.version ?? '0.3.0'

  type PkgDef = { name: string; path: string; type: string; private?: boolean }
  const packages: PkgDef[] = opts.multiPkg
    ? [
        { name: '@test/core', path: 'packages/core', type: 'lib' },
        { name: '@test/cli', path: 'packages/cli', type: 'cli' },
      ]
    : [{ name: '@test/core', path: 'packages/core', type: 'lib' }]

  // Private package in proman.yaml (privatePkg === true or 'yaml-only')
  if (opts.privatePkg) {
    const entry: PkgDef = { name: '@test/private', path: 'packages/private', type: 'lib' }
    if (opts.privatePkg === true || opts.privatePkg === 'yaml-only') entry.private = true
    packages.push(entry)
  }

  const config: Record<string, unknown> = { packages }
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
    // Private via package.json when privatePkg is true or 'pkgjson-only' (not 'yaml-only')
    const isPkgJsonPrivate =
      pkg.name === '@test/private' &&
      opts.privatePkg !== undefined &&
      opts.privatePkg !== 'yaml-only'
    const pkgJson: Record<string, unknown> = { name: pkg.name, version }
    if (isPkgJsonPrivate) pkgJson.private = true
    await writeFile(join(dir, 'package.json'), `${JSON.stringify(pkgJson, null, 2)}\n`)
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

// ── Build pipeline ──

describe('build pipeline', () => {
  test('runs install → build → test → check', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    const pipeline = calls.filter((c) => ['install', 'build', 'test', 'check'].includes(c))
    expect(pipeline).toEqual(['install', 'build', 'test', 'check'])
  })

  test('--skip-tests skips test step', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm, skipTests: true })

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
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest`)
  })

  test('publishes with --tag rc for rc version', async () => {
    await setupFixture(tmp, { version: '0.3.0-rc.1' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=rc`)
  })

  test('passes access from config', async () => {
    await setupFixture(tmp, { access: 'public' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain(`publish ${join(tmp, 'packages/core')} tag=latest access=public`)
  })

  test('multi-package publish in order', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await publish({ cwd: tmp, git, npm })

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
    await expect(publish({ cwd: tmp, git, npm })).rejects.toThrow('publish failed for @test/cli')
  })

  test('skips already-published packages and continues', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const published: string[] = []
    const { npm } = makeNpm({
      publish: async (dir) => {
        if (dir.includes('core')) {
          throw new Error('You cannot publish over the previously published versions: 0.3.0')
        }
        published.push(dir)
      },
    })
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
      await publish({ cwd: tmp, git, npm })
    } finally {
      console.log = origLog
    }

    expect(logs.some((l) => l.includes('⏭ skipped @test/core@0.3.0 (already published)'))).toBe(
      true,
    )
    expect(published.some((d) => d.includes('cli'))).toBe(true)
  })

  test('pre-checks registry and skips already-published without calling npm publish', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const published: string[] = []
    const { npm } = makeNpm({
      publish: async (dir) => {
        published.push(dir)
      },
    })
    // Mock registry: core@0.3.0 already exists
    const registryFetch = async (pkg: string) => {
      if (pkg === '@test/core') return ['0.1.0', '0.2.0', '0.3.0']
      return []
    }
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
      await publish({ cwd: tmp, git, npm, registryFetch })
    } finally {
      console.log = origLog
    }

    // core should be skipped via pre-check, not via error catch
    expect(logs.some((l) => l.includes('⏭ skipped @test/core@0.3.0 (already published)'))).toBe(
      true,
    )
    // npm.publish should NOT have been called for core
    expect(published.some((d) => d.includes('core'))).toBe(false)
    // cli should still be published
    expect(published.some((d) => d.includes('cli'))).toBe(true)
  })

  test('real publish errors still abort', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git } = makeGit()
    const { npm } = makeNpm({
      publish: async (dir) => {
        if (dir.includes('core')) throw new Error('npm ERR! 401 Unauthorized')
      },
    })
    await expect(publish({ cwd: tmp, git, npm })).rejects.toThrow('publish failed for @test/core')
  })

  test('skips packages with private: true in proman.yaml only', async () => {
    // privatePkg === 'yaml-only': proman.yaml has private: true, package.json does NOT
    await setupFixture(tmp, { privatePkg: 'yaml-only' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
      await publish({ cwd: tmp, git, npm })
    } finally {
      console.log = origLog
    }

    const publishCalls = calls.filter((c) => c.startsWith('publish'))
    expect(publishCalls.every((c) => !c.includes('private'))).toBe(true)
    expect(logs.some((l) => l.includes('⏭ skipped @test/private (private)'))).toBe(true)
  })

  test('skips packages with private: true in proman.yaml', async () => {
    await setupFixture(tmp, { privatePkg: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
      await publish({ cwd: tmp, git, npm })
    } finally {
      console.log = origLog
    }

    const publishCalls = calls.filter((c) => c.startsWith('publish'))
    expect(publishCalls.every((c) => !c.includes('private'))).toBe(true)
    expect(logs.some((l) => l.includes('⏭ skipped @test/private (private)'))).toBe(true)
  })

  test('skips packages with private: true in package.json', async () => {
    // privatePkg === 'pkgjson-only': no private flag in proman.yaml, but package.json has "private": true
    await setupFixture(tmp, { privatePkg: 'pkgjson-only' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const logs: string[] = []
    const origLog = console.log
    console.log = (...args: unknown[]) => logs.push(args.join(' '))
    try {
      await publish({ cwd: tmp, git, npm })
    } finally {
      console.log = origLog
    }

    const publishCalls = calls.filter((c) => c.startsWith('publish'))
    expect(publishCalls.every((c) => !c.includes('private'))).toBe(true)
    expect(logs.some((l) => l.includes('⏭ skipped @test/private (private)'))).toBe(true)
  })

  test('private packages do not break publish pipeline', async () => {
    // Mix of normal + private: pipeline should succeed and only publish non-private ones
    await setupFixture(tmp, { multiPkg: true, privatePkg: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await expect(publish({ cwd: tmp, git, npm })).resolves.toBeUndefined()

    const publishCalls = calls.filter((c) => c.startsWith('publish'))
    expect(publishCalls).toHaveLength(2)
    expect(publishCalls.some((c) => c.includes('core'))).toBe(true)
    expect(publishCalls.some((c) => c.includes('cli'))).toBe(true)
    expect(publishCalls.every((c) => !c.includes('private'))).toBe(true)
  })
})

// ── RC version ──

describe('rc versions', () => {
  test('rc version does not affect changesets (publish never touches them)', async () => {
    await setupFixture(tmp, { version: '0.3.0-rc.1', withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    // Changesets untouched by publish regardless of RC
    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files).toContain('add-feature.md')
  })

  test('uses rc tag for git tag', async () => {
    await setupFixture(tmp, { version: '1.0.0-rc.1' })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain('tag @test/core@v1.0.0-rc.1')
  })
})

// ── Changelog (moved to bump in issue #74) ──

describe('changelog', () => {
  test('does not generate changelog even with changesets present', async () => {
    await setupFixture(tmp, { version: '0.2.1', withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    // No CHANGELOG.md created — that's bump's job now
    const exists = await readFile(join(tmp, 'packages/core/CHANGELOG.md'), 'utf8').catch(() => null)
    expect(exists).toBeNull()
  })

  test('does not delete changeset files', async () => {
    await setupFixture(tmp, { version: '0.2.1', withChangeset: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    const csDir = join(tmp, '.changeset')
    const files = await readdir(csDir)
    expect(files).toContain('add-feature.md')
  })
})

// ── Git operations ──

describe('git operations', () => {
  test('commits with author, tags, pushes', async () => {
    await setupFixture(tmp, { version: '0.3.0' })
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain('add')
    expect(calls).toContain('commit release: v0.3.0')
    expect(calls).toContain('tag @test/core@v0.3.0')
    expect(calls).toContain('pushTags')
    expect(calls).toContain('push main')
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('custom git tag prefix', async () => {
    await setupFixture(tmp, { version: '0.2.0', gitTagPrefix: 'release-' })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    expect(calls).toContain('tag @test/core@release-0.2.0')
  })

  test('tags all publishable packages (publish does not read changesets)', async () => {
    await setupFixture(tmp, {
      multiPkg: true,
      withChangeset: true,
      changesetBody: '---\n"@test/core": patch\n---\nFix core bug\n',
    })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    const tags = calls.filter((c) => c.startsWith('tag '))
    expect(tags).toHaveLength(2)
    expect(tags[0]).toContain('@test/core@v')
    expect(tags[1]).toContain('@test/cli@v')
  })

  test('tags all packages when no changesets (manual bump)', async () => {
    await setupFixture(tmp, { multiPkg: true })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await publish({ cwd: tmp, git, npm })

    const tags = calls.filter((c) => c.startsWith('tag '))
    expect(tags).toHaveLength(2)
    expect(tags[0]).toContain('@test/core@v')
    expect(tags[1]).toContain('@test/cli@v')
  })
})

// ── Smoke test tarball ──

describe('smoke test tarball', () => {
  test('runs smoke test before npm publish for packages with bin entry', async () => {
    // Create package with bin entry
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { testcli: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const spawnCalls: string[] = []
    const { npm } = makeNpm({
      publish: async (dir) => {
        spawnCalls.push(`publish ${dir}`)
      },
    })

    const mockSpawn = async (argv: string[], _cwd: string) => {
      const cmd = argv.join(' ')
      spawnCalls.push(cmd)
      if (cmd.includes('pack')) {
        return { code: 0, stdout: 'test-0.3.0.tgz\n', stderr: '' }
      }
      if (cmd.includes('--version')) {
        return { code: 0, stdout: '0.3.0\n', stderr: '' }
      }
      if (cmd.startsWith('tar ')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn })

    // Verify npm pack and bin test ran before publish
    const packIdx = spawnCalls.findIndex((c) => c.includes('pack'))
    const publishIdx = spawnCalls.findIndex((c) => c.startsWith('publish'))
    expect(packIdx).toBeGreaterThan(-1)
    expect(publishIdx).toBeGreaterThan(-1)
    expect(packIdx).toBeLessThan(publishIdx)
  })

  test('aborts publish when smoke test fails', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { broken: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const published: string[] = []
    const { npm } = makeNpm({
      publish: async (dir) => {
        published.push(dir)
      },
    })

    const mockSpawn = async (argv: string[]) => {
      if (argv.includes('pack')) {
        return { code: 0, stdout: 'test-0.3.0.tgz\n', stderr: '' }
      }
      if (argv.includes('--version')) {
        // Simulate broken bin
        return { code: 1, stdout: '', stderr: 'Error: Cannot find module' }
      }
      if (argv[0] === 'tar') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    await expect(publish({ cwd: tmp, git, npm, spawn: mockSpawn })).rejects.toThrow(
      'smoke test failed',
    )

    // Verify npm publish was never called
    expect(published.length).toBe(0)
  })

  test('skips smoke test for packages without bin entry', async () => {
    // Package without bin entry (pure library)
    await setupFixture(tmp)

    const { git } = makeGit()
    const { npm } = makeNpm()
    const spawnCalls: string[] = []
    const mockSpawn = async (argv: string[]) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn })

    // Should not call npm pack or tar (no smoke test needed)
    expect(spawnCalls.some((c) => c.includes('pack'))).toBe(false)
    expect(spawnCalls.some((c) => c.includes('tar'))).toBe(false)
  })

  test('smoke test does not prevent git operations on success', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { testcli: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git, calls } = makeGit()
    const { npm } = makeNpm()

    const mockSpawn = async (argv: string[]) => {
      if (argv.includes('pack')) {
        return { code: 0, stdout: 'test-0.3.0.tgz\n', stderr: '' }
      }
      if (argv.includes('--version')) {
        return { code: 0, stdout: '0.3.0\n', stderr: '' }
      }
      if (argv[0] === 'tar') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn })

    // Git operations should still happen
    expect(calls).toContain('add')
    expect(calls).toContain('commit release: v0.3.0')
    expect(calls).toContain('pushTags')
  })
})

// ── --skip-smoke flag ──

describe('--skip-smoke flag', () => {
  test('skips smoke test entirely when skipSmoke is true', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { testcli: './dist/cli.js' }
    parsed.scripts = { smoke: 'vitest run smoke.test.ts' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const spawnCalls: string[] = []
    const { npm } = makeNpm()

    const mockSpawn: SpawnFn = async (argv: string[]) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn, skipSmoke: true })

    // No smoke test at all
    expect(spawnCalls.some((c) => c.includes('pnpm run smoke'))).toBe(false)
    expect(spawnCalls.some((c) => c.includes('pnpm pack'))).toBe(false)
    expect(spawnCalls.some((c) => c.includes('--version'))).toBe(false)
  })

  test('skips smoke even when packages have bin entries', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { testcli: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const spawnCalls: string[] = []
    const { npm } = makeNpm()

    const mockSpawn: SpawnFn = async (argv: string[]) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn, skipSmoke: true })

    // No tarball-based smoke test
    expect(spawnCalls.some((c) => c.includes('pnpm pack'))).toBe(false)
  })

  test('rest of publish pipeline proceeds normally with --skip-smoke', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.bin = { testcli: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git, calls: gitCalls } = makeGit()
    const { npm, calls: npmCalls } = makeNpm()

    await publish({ cwd: tmp, git, npm, skipSmoke: true })

    // Build pipeline still runs
    expect(npmCalls).toContain('install')
    expect(npmCalls).toContain('build')
    expect(npmCalls).toContain('test')
    expect(npmCalls).toContain('check')
    // Publish still happens
    expect(npmCalls.some((c) => c.startsWith('publish'))).toBe(true)
    // Git operations still happen
    expect(gitCalls).toContain('add')
    expect(gitCalls).toContain('pushTags')
  })
})

// ── Smoke test with custom script ──

describe('smoke test with custom script', () => {
  test('uses pnpm run smoke when package has smoke script', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.scripts = { smoke: 'vitest run smoke.test.ts' }
    parsed.bin = { testcli: './dist/cli.js' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const spawnCalls: string[] = []
    const { npm } = makeNpm()

    const mockSpawn: SpawnFn = async (argv: string[]) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: 'ok\n', stderr: '' }
    }

    await publish({ cwd: tmp, git, npm, spawn: mockSpawn })

    // Should use pnpm run smoke, NOT tarball strategy
    expect(spawnCalls.some((c) => c.includes('pnpm run smoke'))).toBe(true)
    expect(spawnCalls.some((c) => c.includes('pnpm pack'))).toBe(false)
  })

  test('aborts publish when custom smoke script fails', async () => {
    await setupFixture(tmp)
    const pkgDir = join(tmp, 'packages/core')
    const pkgJsonPath = join(pkgDir, 'package.json')
    const pkgJson = await readFile(pkgJsonPath, 'utf8')
    const parsed = JSON.parse(pkgJson) as Record<string, unknown>
    parsed.scripts = { smoke: 'vitest run smoke.test.ts' }
    await writeFile(pkgJsonPath, JSON.stringify(parsed, null, 2))

    const { git } = makeGit()
    const published: string[] = []
    const { npm } = makeNpm({
      publish: async (dir) => {
        published.push(dir)
      },
    })

    const mockSpawn: SpawnFn = async () => {
      return { code: 1, stdout: '', stderr: 'FAIL smoke tests' }
    }

    await expect(publish({ cwd: tmp, git, npm, spawn: mockSpawn })).rejects.toThrow(
      'smoke test failed',
    )
    expect(published).toHaveLength(0)
  })
})
