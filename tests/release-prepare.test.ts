import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseReleasePrepareArgs } from '../src/cli.ts'
import { type GitOps, releasePrepare } from '../src/commands/release-prepare.ts'

function makeGit(overrides: Partial<GitOps> = {}) {
  const calls: string[] = []
  let lastAuthor: string | undefined
  const base: GitOps = {
    getCurrentBranch: async () => 'main',
    isCleanTree: async () => true,
    branchExists: async () => false,
    checkoutNewBranch: async (n) => {
      calls.push(`checkout ${n}`)
    },
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
  }
  const merged = { ...base, ...overrides }
  return { git: merged as GitOps, calls, getAuthor: () => lastAuthor }
}

async function setupFixture(
  tmp: string,
  opts: { withChangeset?: boolean; onlyConfig?: boolean } = {},
) {
  await writeFile(
    join(tmp, 'proman.config.ts'),
    `export default {
  name: 'test',
  runtime: 'bun',
  packages: [
    { name: 'pkg-a', path: 'packages/a' },
    { name: 'pkg-b', path: 'packages/b' },
  ],
}
`,
  )
  await mkdir(join(tmp, 'packages/a'), { recursive: true })
  await mkdir(join(tmp, 'packages/b'), { recursive: true })
  await writeFile(
    join(tmp, 'packages/a/package.json'),
    `${JSON.stringify(
      { name: 'pkg-a', version: '0.2.0', dependencies: { 'pkg-b': 'workspace:*' } },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(tmp, 'packages/b/package.json'),
    `${JSON.stringify({ name: 'pkg-b', version: '0.2.0' }, null, 2)}\n`,
  )
  await mkdir(join(tmp, '.changeset'), { recursive: true })
  if (opts.onlyConfig || opts.withChangeset === false) {
    await writeFile(join(tmp, '.changeset/config.json'), '{}')
  }
  if (opts.withChangeset) {
    await writeFile(join(tmp, '.changeset/foo.md'), '---\n---\nbump\n')
  }
}

describe('releasePrepare pre-flight', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rp-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('rejects when not on main', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git, calls } = makeGit({ getCurrentBranch: async () => 'feature/x' })
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git })).rejects.toThrow(/main/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when working tree dirty', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git, calls } = makeGit({ isCleanTree: async () => false })
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git })).rejects.toThrow(/clean/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when no pending changesets and no --force', async () => {
    await setupFixture(tmp, { onlyConfig: true })
    const { git, calls } = makeGit()
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git })).rejects.toThrow(/changeset/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('--force skips changeset check', async () => {
    await setupFixture(tmp, { onlyConfig: true })
    const { git, calls } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git, force: true })
    expect(calls).toContain('checkout release/0.3.0')
  })

  test('changeset detection ignores config.json', async () => {
    await setupFixture(tmp, { onlyConfig: true })
    const { git: g1 } = makeGit()
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git: g1 })).rejects.toThrow(
      /changeset/i,
    )
    await writeFile(join(tmp, '.changeset/extra.md'), '---\n---\n')
    const { git: g2, calls } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git: g2 })
    expect(calls).toContain('checkout release/0.3.0')
  })

  test('rejects when release/<version> branch already exists', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git, calls } = makeGit({ branchExists: async () => true })
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git })).rejects.toThrow(
      /release\/0\.3\.0/,
    )
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects invalid version', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const { git } = makeGit()
    await expect(releasePrepare({ version: '', cwd: tmp, git })).rejects.toThrow(/version/i)
    await expect(releasePrepare({ version: 'not-a-version', cwd: tmp, git })).rejects.toThrow(
      /version/i,
    )
  })

  test('no destructive disk changes on validation failure', async () => {
    await setupFixture(tmp, { withChangeset: true })
    const aBefore = await readFile(join(tmp, 'packages/a/package.json'))
    const bBefore = await readFile(join(tmp, 'packages/b/package.json'))

    // case 1: not on main
    const { git: g1 } = makeGit({ getCurrentBranch: async () => 'feature/x' })
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git: g1 })).rejects.toThrow()
    expect((await readFile(join(tmp, 'packages/a/package.json'))).equals(aBefore)).toBe(true)
    expect((await readFile(join(tmp, 'packages/b/package.json'))).equals(bBefore)).toBe(true)

    // case 6: branch exists
    const { git: g6 } = makeGit({ branchExists: async () => true })
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git: g6 })).rejects.toThrow()
    expect((await readFile(join(tmp, 'packages/a/package.json'))).equals(aBefore)).toBe(true)

    // case 3: missing changesets
    await rm(join(tmp, '.changeset/foo.md'))
    const { git: g3 } = makeGit()
    await expect(releasePrepare({ version: '0.3.0', cwd: tmp, git: g3 })).rejects.toThrow()
    expect((await readFile(join(tmp, 'packages/a/package.json'))).equals(aBefore)).toBe(true)
  })
})

describe('releasePrepare happy path', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rp-'))
    await setupFixture(tmp, { withChangeset: true })
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('creates branch, rewrites workspaces, commits, pushes', async () => {
    const bBefore = await readFile(join(tmp, 'packages/b/package.json'))
    const { git, calls } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git })

    const aText = await readFile(join(tmp, 'packages/a/package.json'), 'utf8')
    const aParsed = JSON.parse(aText)
    expect(aParsed.dependencies['pkg-b']).toBe('0.2.0')
    const bAfter = await readFile(join(tmp, 'packages/b/package.json'))
    expect(bAfter.equals(bBefore)).toBe(true)
    expect(calls).toEqual([
      'checkout release/0.3.0',
      'add',
      'commit release: prepare v0.3.0',
      'push release/0.3.0',
    ])
  })

  test('commit author is 小橘 <xiaoju@shazhou.work>', async () => {
    const { git, getAuthor } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git })
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('commit message format', async () => {
    const { git, calls } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git })
    expect(calls).toContain('commit release: prepare v0.3.0')
  })

  test('branch creation precedes rewrite-related git ops', async () => {
    const { git, calls } = makeGit()
    await releasePrepare({ version: '0.3.0', cwd: tmp, git })
    const ci = calls.indexOf('checkout release/0.3.0')
    const ai = calls.indexOf('add')
    const mi = calls.indexOf('commit release: prepare v0.3.0')
    const pi = calls.indexOf('push release/0.3.0')
    expect(ci).toBeLessThan(ai)
    expect(ai).toBeLessThan(mi)
    expect(mi).toBeLessThan(pi)
  })
})

describe('parseReleasePrepareArgs', () => {
  test('parses --version 0.3.0', () => {
    expect(parseReleasePrepareArgs(['--version', '0.3.0'])).toEqual({
      version: '0.3.0',
      force: false,
    })
  })

  test('parses --force order independent', () => {
    expect(parseReleasePrepareArgs(['--version', '0.3.0', '--force'])).toEqual({
      version: '0.3.0',
      force: true,
    })
    expect(parseReleasePrepareArgs(['--force', '--version', '0.3.0'])).toEqual({
      version: '0.3.0',
      force: true,
    })
  })

  test('errors on missing --version', () => {
    expect(() => parseReleasePrepareArgs([])).toThrow(/--version/)
    expect(() => parseReleasePrepareArgs(['--force'])).toThrow(/--version/)
  })

  test('errors on unknown flag', () => {
    expect(() => parseReleasePrepareArgs(['--version', '0.3.0', '--bogus'])).toThrow(/--bogus/)
  })
})
