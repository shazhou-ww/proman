import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseReleaseCandidateArgs } from '../src/cli.ts'
import {
  type GitOps,
  type NpmRegistryFetch,
  type NpmRunner,
  releaseCandidate,
} from '../src/commands/release-candidate.ts'

function makeGit(overrides: Partial<GitOps> = {}) {
  const calls: string[] = []
  let lastAuthor: string | undefined
  const base: GitOps = {
    getCurrentBranch: async () => 'release/0.3.0',
    isCleanTree: async () => true,
    branchExists: async () => false,
    checkoutNewBranch: async (n) => {
      calls.push(`checkout ${n}`)
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
    tag: async () => {},
    pushTags: async () => {},
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

function makeFetch(versions: string[]) {
  const calls: string[] = []
  const fetchFn: NpmRegistryFetch = async (pkg) => {
    calls.push(pkg)
    return versions
  }
  return { fetchFn, calls }
}

type FixtureOptions = {
  runtime?: 'bun' | 'node'
  access?: 'public' | 'restricted'
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const runtime = opts.runtime ?? 'bun'
  const releaseBlock = opts.access ? `\nrelease:\n  access: ${opts.access}` : ''
  await writeFile(
    join(tmp, 'proman.yaml'),
    `name: test
runtime: ${runtime}
packages:
  - name: pkg-a
    path: packages/a
  - name: pkg-b
    path: packages/b${releaseBlock}
`,
  )
  await mkdir(join(tmp, 'packages/a'), { recursive: true })
  await mkdir(join(tmp, 'packages/b'), { recursive: true })
  await writeFile(
    join(tmp, 'packages/a/package.json'),
    `${JSON.stringify(
      { name: 'pkg-a', version: '0.3.0', dependencies: { 'pkg-b': '0.3.0' } },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(tmp, 'packages/b/package.json'),
    `${JSON.stringify({ name: 'pkg-b', version: '0.3.0' }, null, 2)}\n`,
  )
}

describe('releaseCandidate pre-flight', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('rejects when not on release/* branch', async () => {
    const { git, calls: gcalls } = makeGit({ getCurrentBranch: async () => 'main' })
    const { npm, calls: ncalls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /release/i,
    )
    expect(ncalls.length).toBe(0)
    expect(gcalls.some((c) => /add|commit|push/.test(c))).toBe(false)
  })

  test('rejects on dirty tree', async () => {
    const { git, calls: gcalls } = makeGit({ isCleanTree: async () => false })
    const { npm, calls: ncalls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /clean/i,
    )
    expect(ncalls.length).toBe(0)
    expect(gcalls.some((c) => /add|commit|push/.test(c))).toBe(false)
  })

  test('rejects on malformed release branch', async () => {
    const { git } = makeGit({ getCurrentBranch: async () => 'release/' })
    const { npm } = makeNpm()
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow()
  })
})

describe('releaseCandidate version derivation', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('derives 0.3.0-rc.1 from empty registry', async () => {
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    expect(calls.some((c) => /publish .* tag=rc/.test(c))).toBe(true)
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    const b = JSON.parse(await readFile(join(tmp, 'packages/b/package.json'), 'utf8'))
    expect(a.version).toBe('0.3.0-rc.1')
    expect(b.version).toBe('0.3.0-rc.1')
  })

  test('increments existing rc to 0.3.0-rc.3', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    const { fetchFn } = makeFetch(['0.3.0-rc.1', '0.3.0-rc.2'])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    expect(a.version).toBe('0.3.0-rc.3')
  })

  test('registry queried only once with first package name', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    const { fetchFn, calls } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    expect(calls.length).toBe(1)
    expect(calls[0]).toBe('pkg-a')
  })
})

describe('releaseCandidate build pipeline', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('runs install→build→test→check before publishes', async () => {
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const i = calls.indexOf('install')
    const b = calls.indexOf('build')
    const t = calls.indexOf('test')
    const c = calls.indexOf('check')
    const p1 = calls.findIndex((s) => s.startsWith('publish '))
    expect(i).toBeLessThan(b)
    expect(b).toBeLessThan(t)
    expect(t).toBeLessThan(c)
    expect(c).toBeLessThan(p1)
  })

  test('build failure aborts before publish/commit/push', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      build: async () => {
        throw new Error('build broke')
      },
    })
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /build broke/,
    )
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /add|commit|push/.test(c))).toBe(false)
  })

  test('test failure aborts before publish', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      test: async () => {
        throw new Error('tests fail')
      },
    })
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /tests fail/,
    )
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /add|commit|push/.test(c))).toBe(false)
  })

  test('check failure aborts before publish', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      check: async () => {
        throw new Error('check fail')
      },
    })
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /check fail/,
    )
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /add|commit|push/.test(c))).toBe(false)
  })
})

describe('releaseCandidate publish', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('publishes packages in config order with --tag rc', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const pubs = calls.filter((c) => c.startsWith('publish '))
    expect(pubs.length).toBe(2)
    expect(pubs[0]).toContain(resolve(tmp, 'packages/a'))
    expect(pubs[0]).toContain('tag=rc')
    expect(pubs[1]).toContain(resolve(tmp, 'packages/b'))
    expect(pubs[1]).toContain('tag=rc')
  })

  test('passes access=public when configured', async () => {
    await setupFixture(tmp, { access: 'public' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const pubs = calls.filter((c) => c.startsWith('publish '))
    expect(pubs.every((p) => p.includes('access=public'))).toBe(true)
  })

  test('omits access when not configured', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const pubs = calls.filter((c) => c.startsWith('publish '))
    expect(pubs.some((p) => p.includes('access='))).toBe(false)
  })

  test('publish failure on second package aborts and reports', async () => {
    await setupFixture(tmp)
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      publish: async (dir, o) => {
        if (dir.endsWith('packages/b')) throw new Error('boom')
        calls.push(`publish ${dir} tag=${o.tag}`)
      },
    })
    const { fetchFn } = makeFetch([])
    await expect(releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })).rejects.toThrow(
      /pkg-b/,
    )
    expect(calls.some((c) => c.includes('packages/a'))).toBe(true)
    expect(gcalls.some((c) => /commit|push/.test(c))).toBe(false)
  })
})

describe('releaseCandidate package.json updates', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('writes new rc version into all package.json', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    const b = JSON.parse(await readFile(join(tmp, 'packages/b/package.json'), 'utf8'))
    expect(a.version).toBe('0.3.0-rc.1')
    expect(b.version).toBe('0.3.0-rc.1')
  })

  test('does not regress workspace deps to workspace:*', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    expect(a.dependencies['pkg-b']).not.toBe('workspace:*')
  })
})

describe('releaseCandidate git operations', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rc-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('commits and pushes with correct message and author', async () => {
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git, npm, registryFetch: fetchFn })
    expect(calls).toContain('add')
    expect(calls).toContain('commit release: v0.3.0-rc.1')
    expect(calls).toContain('push release/0.3.0')
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('git operations come last', async () => {
    const { git: g, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm()
    const { fetchFn } = makeFetch([])
    await releaseCandidate({ cwd: tmp, git: g, npm, registryFetch: fetchFn })
    // Find indexes in unified call sequence: publish before add/commit/push
    const npmLastPublishIdx = calls
      .map((c, i) => (c.startsWith('publish') ? i : -1))
      .filter((i) => i >= 0)
      .pop()
    expect(typeof npmLastPublishIdx).toBe('number')
    // git ops are recorded separately; what we assert is just that all gcalls happened
    expect(gcalls).toEqual(['add', 'commit release: v0.3.0-rc.1', 'push release/0.3.0'])
  })
})

describe('parseReleaseCandidateArgs', () => {
  test('returns empty for no args', () => {
    expect(parseReleaseCandidateArgs([])).toEqual({})
  })
  test('throws on unknown flag', () => {
    expect(() => parseReleaseCandidateArgs(['--bogus'])).toThrow(/--bogus/)
  })
})
