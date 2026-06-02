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
    checkoutNewBranchFrom: async (n, ref) => {
      calls.push(`checkoutFrom ${n} ${ref}`)
    },
    tagExists: async () => true,
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
  const merged = { ...base, ...overrides }
  return { git: merged as GitOps, calls, getAuthor: () => lastAuthor }
}

async function setupFixture(
  tmp: string,
  opts: {
    withChangeset?: boolean
    onlyConfig?: boolean
    changesetBody?: string
    packageVersion?: string
  } = {},
) {
  const pkgVersion = opts.packageVersion ?? '0.2.0'
  await writeFile(
    join(tmp, 'proman.yaml'),
    `name: test
runtime: bun
packages:
  - name: pkg-a
    path: packages/a
  - name: pkg-b
    path: packages/b
`,
  )
  await mkdir(join(tmp, 'packages/a'), { recursive: true })
  await mkdir(join(tmp, 'packages/b'), { recursive: true })
  await writeFile(
    join(tmp, 'packages/a/package.json'),
    `${JSON.stringify(
      { name: 'pkg-a', version: pkgVersion, dependencies: { 'pkg-b': 'workspace:*' } },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(tmp, 'packages/b/package.json'),
    `${JSON.stringify({ name: 'pkg-b', version: pkgVersion }, null, 2)}\n`,
  )
  await mkdir(join(tmp, '.changeset'), { recursive: true })
  if (opts.onlyConfig || opts.withChangeset === false) {
    await writeFile(join(tmp, '.changeset/config.json'), '{}')
  }
  if (opts.withChangeset) {
    const body = opts.changesetBody ?? '---\n---\nbump\n'
    await writeFile(join(tmp, '.changeset/foo.md'), body)
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
      from: undefined,
      patch: false,
    })
  })

  test('parses --force order independent', () => {
    expect(parseReleasePrepareArgs(['--version', '0.3.0', '--force'])).toEqual({
      version: '0.3.0',
      force: true,
      from: undefined,
      patch: false,
    })
    expect(parseReleasePrepareArgs(['--force', '--version', '0.3.0'])).toEqual({
      version: '0.3.0',
      force: true,
      from: undefined,
      patch: false,
    })
  })

  test('no args returns undefined version', () => {
    expect(parseReleasePrepareArgs([])).toEqual({
      version: undefined,
      force: false,
      from: undefined,
      patch: false,
    })
    expect(parseReleasePrepareArgs(['--force'])).toEqual({
      version: undefined,
      force: true,
      from: undefined,
      patch: false,
    })
  })

  test('parses --from <tag>', () => {
    expect(parseReleasePrepareArgs(['--from', 'v0.2.3'])).toEqual({
      version: undefined,
      force: false,
      from: 'v0.2.3',
      patch: false,
    })
  })

  test('parses --from <tag> --patch', () => {
    expect(parseReleasePrepareArgs(['--from', 'v0.2.3', '--patch'])).toEqual({
      version: undefined,
      force: false,
      from: 'v0.2.3',
      patch: true,
    })
  })

  test('order-independent --from --patch --version --force', () => {
    expect(
      parseReleasePrepareArgs(['--patch', '--from', 'v0.2.3', '--force', '--version', '0.5.0']),
    ).toEqual({
      version: '0.5.0',
      force: true,
      from: 'v0.2.3',
      patch: true,
    })
  })

  test('--from without value throws', () => {
    expect(() => parseReleasePrepareArgs(['--from'])).toThrow(/--from/)
  })

  test('--version without value throws', () => {
    expect(() => parseReleasePrepareArgs(['--version'])).toThrow(/--version/)
  })

  test('errors on unknown flag', () => {
    expect(() => parseReleasePrepareArgs(['--version', '0.3.0', '--bogus'])).toThrow(/--bogus/)
  })
})

describe('releasePrepare auto-infer', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rp-ai-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('infers minor → 0.3.0', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": minor\n---\n\nadd a feature\n',
    })
    const { git, calls, getAuthor } = makeGit()
    await releasePrepare({ cwd: tmp, git })
    const aText = await readFile(join(tmp, 'packages/a/package.json'), 'utf8')
    expect(JSON.parse(aText).dependencies['pkg-b']).toBe('0.2.0')
    expect(calls).toEqual([
      'checkout release/0.3.0',
      'add',
      'commit release: prepare v0.3.0',
      'push release/0.3.0',
    ])
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('infers major → 1.0.0', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": major\n---\n\nbreaking\n',
    })
    const { git, calls } = makeGit()
    await releasePrepare({ cwd: tmp, git })
    expect(calls).toContain('checkout release/1.0.0')
    expect(calls).toContain('commit release: prepare v1.0.0')
  })

  test('two changesets: patch + minor → 0.3.0', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": patch\n---\n\nfix\n',
    })
    await writeFile(join(tmp, '.changeset/bar.md'), '---\n"pkg-b": minor\n---\n\nfeat\n')
    const { git, calls } = makeGit()
    await releasePrepare({ cwd: tmp, git })
    expect(calls).toContain('checkout release/0.3.0')
  })

  test('two changesets: patch + major → 1.0.0', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": patch\n---\n\nfix\n',
    })
    await writeFile(join(tmp, '.changeset/bar.md'), '---\n"pkg-b": major\n---\n\nbreak\n')
    const { git, calls } = makeGit()
    await releasePrepare({ cwd: tmp, git })
    expect(calls).toContain('checkout release/1.0.0')
  })

  test('--version overrides inferred bump', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": patch\n---\n\nfix\n',
    })
    const { git, calls } = makeGit()
    await releasePrepare({ version: '0.5.0', cwd: tmp, git })
    expect(calls).toContain('checkout release/0.5.0')
  })

  test('rejects when no changesets present', async () => {
    await setupFixture(tmp, { onlyConfig: true })
    const { git, calls } = makeGit()
    await expect(releasePrepare({ cwd: tmp, git })).rejects.toThrow(/changeset/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when all changesets have empty packages records', async () => {
    await setupFixture(tmp, { withChangeset: true, changesetBody: '---\n---\nbody only\n' })
    const { git, calls } = makeGit()
    await expect(releasePrepare({ cwd: tmp, git })).rejects.toThrow(/changeset|bump/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when inferred branch already exists', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": minor\n---\n\nx\n',
    })
    const { git, calls } = makeGit({ branchExists: async () => true })
    await expect(releasePrepare({ cwd: tmp, git })).rejects.toThrow(/release\/0\.3\.0/)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when not on main (no --from)', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": minor\n---\n\nx\n',
    })
    const { git, calls } = makeGit({ getCurrentBranch: async () => 'feature/x' })
    await expect(releasePrepare({ cwd: tmp, git })).rejects.toThrow(/main/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when dirty tree', async () => {
    await setupFixture(tmp, {
      withChangeset: true,
      changesetBody: '---\n"pkg-a": minor\n---\n\nx\n',
    })
    const { git, calls } = makeGit({ isCleanTree: async () => false })
    await expect(releasePrepare({ cwd: tmp, git })).rejects.toThrow(/clean/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })
})

describe('releasePrepare hotfix', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-rp-hf-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('--from v0.2.3 --patch creates release/0.2.4 from tag', async () => {
    await setupFixture(tmp, { onlyConfig: false, packageVersion: '0.2.3' })
    // remove .changeset entirely to verify it's not required
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({
      getCurrentBranch: async () => 'feature/anything',
      tagExists: async () => true,
    })
    await releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })
    expect(calls).toEqual([
      'checkoutFrom release/0.2.4 v0.2.3',
      'add',
      'commit release: prepare v0.2.4',
      'push release/0.2.4',
    ])
    expect(calls.some((c) => c.startsWith('checkout release/'))).toBe(false)
  })

  test('--from 0.2.3 --patch (no v prefix) → release/0.2.4', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await releasePrepare({ from: '0.2.3', patch: true, cwd: tmp, git })
    expect(calls).toContain('checkoutFrom release/0.2.4 0.2.3')
  })

  test('--from v1.4.7 --patch → release/1.4.8', async () => {
    await setupFixture(tmp, { packageVersion: '1.4.7' })
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await releasePrepare({ from: 'v1.4.7', patch: true, cwd: tmp, git })
    expect(calls).toContain('checkoutFrom release/1.4.8 v1.4.7')
  })

  test('--from v0.2.3 --version 0.3.0 (manual override)', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await releasePrepare({ from: 'v0.2.3', version: '0.3.0', cwd: tmp, git })
    expect(calls).toContain('checkoutFrom release/0.3.0 v0.2.3')
  })

  test('rejects when tag does not exist', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    const { git, calls } = makeGit({ tagExists: async () => false })
    await expect(releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })).rejects.toThrow(
      /tag.*v0\.2\.3|v0\.2\.3.*not found/i,
    )
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when dirty tree under --from', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    const { git, calls } = makeGit({
      tagExists: async () => true,
      isCleanTree: async () => false,
    })
    await expect(releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })).rejects.toThrow(
      /clean/i,
    )
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('rejects when release/<new> already exists', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    const { git, calls } = makeGit({
      tagExists: async () => true,
      branchExists: async () => true,
    })
    await expect(releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })).rejects.toThrow(
      /release\/0\.2\.4/,
    )
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('--from without --patch and without --version rejects', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await expect(releasePrepare({ from: 'v0.2.3', cwd: tmp, git })).rejects.toThrow(
      /--patch|--version/i,
    )
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('--patch without --from rejects', async () => {
    await setupFixture(tmp, { withChangeset: true, changesetBody: '---\n"pkg-a": patch\n---\nx\n' })
    const { git, calls } = makeGit()
    await expect(releasePrepare({ patch: true, cwd: tmp, git })).rejects.toThrow(/--from/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('bad tag format rejects', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await expect(
      releasePrepare({ from: 'release-foo', patch: true, cwd: tmp, git }),
    ).rejects.toThrow(/invalid tag/i)
    expect(calls.some((c) => /checkout|add|commit|push/.test(c))).toBe(false)
  })

  test('hotfix does not require .changeset directory', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({ tagExists: async () => true })
    await releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })
    expect(calls).toContain('checkoutFrom release/0.2.4 v0.2.3')
  })

  test('hotfix does not require main branch', async () => {
    await setupFixture(tmp, { packageVersion: '0.2.3' })
    await rm(join(tmp, '.changeset'), { recursive: true, force: true })
    const { git, calls } = makeGit({
      tagExists: async () => true,
      getCurrentBranch: async () => 'detached',
    })
    await releasePrepare({ from: 'v0.2.3', patch: true, cwd: tmp, git })
    expect(calls).toContain('checkoutFrom release/0.2.4 v0.2.3')
  })
})
