import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseReleaseFinalizeArgs } from '../src/cli.ts'
import { type GitOps, type NpmRunner, releaseFinalize } from '../src/commands/release-finalize.ts'

const NOW = () => new Date('2026-06-02T00:00:00Z')

function makeGit(overrides: Partial<GitOps> = {}) {
  const calls: string[] = []
  let lastAuthor: string | undefined
  const base: GitOps = {
    getCurrentBranch: async () => 'release/0.3.0',
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
    log: async () => 'release: v0.3.0-rc.1\nrelease: v0.3.0-rc.2\nfeat: foo\n',
    tag: async (n) => {
      calls.push(`tag ${n}`)
    },
    pushTags: async () => {
      calls.push('pushTags')
    },
    checkout: async (b) => {
      calls.push(`checkout ${b}`)
    },
    merge: async (b, o) => {
      calls.push(`merge ${b} noFf=${o?.noFf ? 'true' : 'false'}`)
    },
    deleteBranchLocal: async (n) => {
      calls.push(`deleteBranchLocal ${n}`)
    },
    deleteBranchRemote: async (n) => {
      calls.push(`deleteBranchRemote ${n}`)
    },
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
    publish: async (dir, o) => {
      calls.push(`publish ${dir} tag=${o.tag}${o.access ? ` access=${o.access}` : ''}`)
    },
  }
  return { npm: { ...base, ...overrides } as NpmRunner, calls }
}

type FixtureOptions = {
  access?: 'public' | 'restricted'
  gitTagPrefix?: string
  changesets?: { file: string; content: string }[]
  noChangesets?: boolean
}

async function setupFixture(tmp: string, opts: FixtureOptions = {}) {
  const releaseEntries: string[] = []
  if (opts.access) releaseEntries.push(`access: '${opts.access}'`)
  if (opts.gitTagPrefix !== undefined) releaseEntries.push(`gitTagPrefix: '${opts.gitTagPrefix}'`)
  const releaseBlock = releaseEntries.length ? `,\n  release: { ${releaseEntries.join(', ')} }` : ''
  await writeFile(
    join(tmp, 'proman.config.ts'),
    `export default {
  name: 'test',
  runtime: 'bun',
  packages: [
    { name: 'pkg-a', path: 'packages/a' },
    { name: 'pkg-b', path: 'packages/b' },
  ]${releaseBlock},
}
`,
  )
  await mkdir(join(tmp, 'packages/a'), { recursive: true })
  await mkdir(join(tmp, 'packages/b'), { recursive: true })
  await writeFile(
    join(tmp, 'packages/a/package.json'),
    `${JSON.stringify(
      { name: 'pkg-a', version: '0.3.0-rc.2', dependencies: { 'pkg-b': '0.3.0-rc.2' } },
      null,
      2,
    )}\n`,
  )
  await writeFile(
    join(tmp, 'packages/b/package.json'),
    `${JSON.stringify({ name: 'pkg-b', version: '0.3.0-rc.2' }, null, 2)}\n`,
  )

  if (!opts.noChangesets) {
    await mkdir(join(tmp, '.changeset'), { recursive: true })
    const changesets = opts.changesets ?? [
      { file: 'funny-fox.md', content: `---\n'pkg-a': minor\n---\n\nAdd A.\n` },
      { file: 'brave-bear.md', content: `---\n'pkg-b': patch\n---\n\nFix B.\n` },
    ]
    for (const c of changesets) {
      await writeFile(join(tmp, '.changeset', c.file), c.content)
    }
  }
}

describe('releaseFinalize pre-flight', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('rejects when not on release/* branch', async () => {
    const { git } = makeGit({ getCurrentBranch: async () => 'main' })
    const { npm, calls } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/release/i)
    expect(calls.length).toBe(0)
  })

  test('rejects on dirty tree', async () => {
    const { git } = makeGit({ isCleanTree: async () => false })
    const { npm, calls } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/clean/i)
    expect(calls.length).toBe(0)
  })

  test('rejects when no rc commit found in log', async () => {
    const { git } = makeGit({ log: async () => 'feat: x\nfix: y\n' })
    const { npm } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/rc/i)
  })

  test('rejects no rc even with --force', async () => {
    const { git } = makeGit({ log: async () => 'feat: x\n' })
    const { npm } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW, force: true })).rejects.toThrow(
      /rc/i,
    )
  })

  test('rejects malformed release branch', async () => {
    const { git } = makeGit({ getCurrentBranch: async () => 'release/' })
    const { npm } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow()
  })
})

describe('releaseFinalize changeset consumption', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('throws without --force when no changesets present', async () => {
    await setupFixture(tmp, { noChangesets: true })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/no changeset/i)
    expect(calls.length).toBe(0)
  })

  test('with --force and no changesets, skips CHANGELOG and proceeds', async () => {
    await setupFixture(tmp, { noChangesets: true })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW, force: true })
    let exists = true
    try {
      await readFile(join(tmp, 'packages/a/CHANGELOG.md'), 'utf8')
    } catch {
      exists = false
    }
    expect(exists).toBe(false)
  })

  test('writes CHANGELOG.md to each affected package', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const aLog = await readFile(join(tmp, 'packages/a/CHANGELOG.md'), 'utf8')
    const bLog = await readFile(join(tmp, 'packages/b/CHANGELOG.md'), 'utf8')
    expect(aLog).toContain('# Changelog')
    expect(aLog).toContain('## 0.3.0 — 2026-06-02')
    expect(aLog).toMatch(/Add A\./)
    expect(aLog).not.toMatch(/Fix B\./)
    expect(bLog).toContain('## 0.3.0 — 2026-06-02')
    expect(bLog).toMatch(/Fix B\./)
    expect(bLog).not.toMatch(/Add A\./)
  })

  test('changeset .md files are deleted, config.json preserved', async () => {
    await setupFixture(tmp)
    await writeFile(join(tmp, '.changeset/config.json'), '{}')
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const remaining = await readdir(join(tmp, '.changeset'))
    expect(remaining).toContain('config.json')
    expect(remaining.filter((n) => n.endsWith('.md')).length).toBe(0)
  })

  test('changeset for two packages produces entry in both CHANGELOGs', async () => {
    await setupFixture(tmp, {
      changesets: [
        {
          file: 'shared.md',
          content: `---\n'pkg-a': minor\n'pkg-b': minor\n---\n\nShared change.\n`,
        },
      ],
    })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const aLog = await readFile(join(tmp, 'packages/a/CHANGELOG.md'), 'utf8')
    const bLog = await readFile(join(tmp, 'packages/b/CHANGELOG.md'), 'utf8')
    expect(aLog).toContain('- Shared change.')
    expect(bLog).toContain('- Shared change.')
  })

  test('changeset references unknown package → throws, no mutation', async () => {
    await setupFixture(tmp, {
      changesets: [{ file: 'mystery.md', content: `---\n'pkg-z': minor\n---\n\nMystery.\n` }],
    })
    const { git } = makeGit()
    const { npm } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(
      /unknown package/i,
    )
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    expect(a.version).toBe('0.3.0-rc.2')
    const remaining = await readdir(join(tmp, '.changeset'))
    expect(remaining).toContain('mystery.md')
  })

  test('preserves existing CHANGELOG.md content', async () => {
    await setupFixture(tmp)
    await writeFile(
      join(tmp, 'packages/a/CHANGELOG.md'),
      '# Changelog\n\n## 0.2.0 — 2025-01-01\n\n- old\n',
    )
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const aLog = await readFile(join(tmp, 'packages/a/CHANGELOG.md'), 'utf8')
    expect(aLog.startsWith('# Changelog\n\n## 0.3.0 — 2026-06-02')).toBe(true)
    expect(aLog).toContain('## 0.2.0')
    expect(aLog).toContain('- old')
  })
})

describe('releaseFinalize version bump', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('all package.json versions become formal 0.3.0', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    const b = JSON.parse(await readFile(join(tmp, 'packages/b/package.json'), 'utf8'))
    // After workspace restore at end, version stays 0.3.0
    expect(a.version).toBe('0.3.0')
    expect(b.version).toBe('0.3.0')
  })

  test('non-internal deps untouched', async () => {
    const aPath = join(tmp, 'packages/a/package.json')
    const a = JSON.parse(await readFile(aPath, 'utf8'))
    a.dependencies = { ...a.dependencies, react: '^18.0.0' }
    await writeFile(aPath, `${JSON.stringify(a, null, 2)}\n`)
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const after = JSON.parse(await readFile(aPath, 'utf8'))
    expect(after.dependencies.react).toBe('^18.0.0')
  })
})

describe('releaseFinalize build pipeline', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('runs install→build→test→check before any publish', async () => {
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
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

  test('build failure aborts before any publish/tag/merge', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      build: async () => {
        throw new Error('build broke')
      },
    })
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/build broke/)
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /^tag|^merge|^pushTags|^deleteBranch/.test(c))).toBe(false)
  })

  test('test failure aborts before publish', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      test: async () => {
        throw new Error('tests fail')
      },
    })
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/tests fail/)
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /^tag|^merge|^pushTags|^deleteBranch/.test(c))).toBe(false)
  })

  test('check failure aborts', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls } = makeNpm({
      check: async () => {
        throw new Error('check fail')
      },
    })
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/check fail/)
    expect(calls.some((c) => c.startsWith('publish'))).toBe(false)
    expect(gcalls.some((c) => /^tag|^merge|^pushTags|^deleteBranch/.test(c))).toBe(false)
  })
})

describe('releaseFinalize publish', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('publishes packages in config order with --tag latest', async () => {
    await setupFixture(tmp)
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const pubs = calls.filter((c) => c.startsWith('publish '))
    expect(pubs.length).toBe(2)
    expect(pubs[0]).toContain('packages/a')
    expect(pubs[0]).toContain('tag=latest')
    expect(pubs[1]).toContain('packages/b')
    expect(pubs[1]).toContain('tag=latest')
  })

  test('honors release.access=public', async () => {
    await setupFixture(tmp, { access: 'public' })
    const { git } = makeGit()
    const { npm, calls } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const pubs = calls.filter((c) => c.startsWith('publish '))
    expect(pubs.every((p) => p.includes('access=public'))).toBe(true)
  })

  test('publish failure on second package aborts before tag/merge', async () => {
    await setupFixture(tmp)
    const { git, calls: gcalls } = makeGit()
    const { npm } = makeNpm({
      publish: async (dir, _o) => {
        if (dir.endsWith('packages/b')) throw new Error('boom')
      },
    })
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/pkg-b/)
    expect(gcalls.some((c) => c.startsWith('tag '))).toBe(false)
    expect(gcalls.some((c) => c.startsWith('pushTags'))).toBe(false)
    expect(gcalls.some((c) => c.startsWith('merge '))).toBe(false)
    expect(gcalls.some((c) => c.startsWith('deleteBranch'))).toBe(false)
  })
})

describe('releaseFinalize tag + push + merge', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('tags v0.3.0 with default prefix', async () => {
    await setupFixture(tmp)
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    expect(calls.filter((c) => c.startsWith('tag ')).length).toBe(1)
    expect(calls).toContain('tag v0.3.0')
  })

  test('uses release.gitTagPrefix when configured', async () => {
    await setupFixture(tmp, { gitTagPrefix: 'release-' })
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    expect(calls).toContain('tag release-0.3.0')
  })

  test('release commit with author, before tag; push branch before pushTags', async () => {
    await setupFixture(tmp)
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const commitIdx = calls.indexOf('commit release: v0.3.0')
    const tagIdx = calls.indexOf('tag v0.3.0')
    const pushBranchIdx = calls.indexOf('push release/0.3.0')
    const pushTagsIdx = calls.indexOf('pushTags')
    expect(commitIdx).toBeGreaterThanOrEqual(0)
    expect(commitIdx).toBeLessThan(tagIdx)
    expect(pushBranchIdx).toBeGreaterThanOrEqual(0)
    expect(pushBranchIdx).toBeLessThan(pushTagsIdx)
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('checkout main, merge --no-ff release/0.3.0', async () => {
    await setupFixture(tmp)
    const { git, calls } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const co = calls.indexOf('checkout main')
    const mg = calls.indexOf('merge release/0.3.0 noFf=true')
    expect(co).toBeGreaterThanOrEqual(0)
    expect(co).toBeLessThan(mg)
  })

  test('merge conflict aborts remainder', async () => {
    await setupFixture(tmp)
    const { git, calls } = makeGit({
      merge: async () => {
        throw new Error('conflict')
      },
    })
    const { npm } = makeNpm()
    await expect(releaseFinalize({ cwd: tmp, git, npm, now: NOW })).rejects.toThrow(/conflict/)
    expect(calls.some((c) => c.startsWith('deleteBranch'))).toBe(false)
    expect(calls.filter((c) => c === 'commit chore: restore workspace:*').length).toBe(0)
  })
})

describe('releaseFinalize workspace restore + cleanup', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-fin-'))
    await setupFixture(tmp)
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('after merge, internal deps are workspace:*', async () => {
    const { git } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    const a = JSON.parse(await readFile(join(tmp, 'packages/a/package.json'), 'utf8'))
    expect(a.dependencies['pkg-b']).toBe('workspace:*')
  })

  test('chore restore commit + push main + delete branch local & remote', async () => {
    const { git, calls, getAuthor } = makeGit()
    const { npm } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })
    expect(calls).toContain('commit chore: restore workspace:*')
    expect(calls).toContain('push main')
    expect(calls).toContain('deleteBranchLocal release/0.3.0')
    expect(calls).toContain('deleteBranchRemote release/0.3.0')
    expect(getAuthor()).toBe('小橘 <xiaoju@shazhou.work>')
  })

  test('happy path full ordering', async () => {
    const { git, calls: gcalls } = makeGit()
    const { npm, calls: ncalls } = makeNpm()
    await releaseFinalize({ cwd: tmp, git, npm, now: NOW })

    // npm part
    expect(ncalls.indexOf('install')).toBeLessThan(ncalls.indexOf('build'))
    expect(ncalls.indexOf('build')).toBeLessThan(ncalls.indexOf('test'))
    expect(ncalls.indexOf('test')).toBeLessThan(ncalls.indexOf('check'))
    const pa = ncalls.findIndex((c) => c.startsWith('publish ') && c.includes('packages/a'))
    const pb = ncalls.findIndex((c) => c.startsWith('publish ') && c.includes('packages/b'))
    expect(ncalls.indexOf('check')).toBeLessThan(pa)
    expect(pa).toBeLessThan(pb)

    // git part
    const idx = (s: string) => gcalls.indexOf(s)
    expect(idx('commit release: v0.3.0')).toBeGreaterThanOrEqual(0)
    expect(idx('commit release: v0.3.0')).toBeLessThan(idx('push release/0.3.0'))
    expect(idx('push release/0.3.0')).toBeLessThan(idx('tag v0.3.0'))
    expect(idx('tag v0.3.0')).toBeLessThan(idx('pushTags'))
    expect(idx('pushTags')).toBeLessThan(idx('checkout main'))
    expect(idx('checkout main')).toBeLessThan(idx('merge release/0.3.0 noFf=true'))
    expect(idx('merge release/0.3.0 noFf=true')).toBeLessThan(
      idx('commit chore: restore workspace:*'),
    )
    expect(idx('commit chore: restore workspace:*')).toBeLessThan(idx('push main'))
    expect(idx('push main')).toBeLessThan(idx('deleteBranchLocal release/0.3.0'))
    expect(idx('deleteBranchLocal release/0.3.0')).toBeLessThan(
      idx('deleteBranchRemote release/0.3.0'),
    )
  })
})

describe('parseReleaseFinalizeArgs', () => {
  test('no args → force false', () => {
    expect(parseReleaseFinalizeArgs([])).toEqual({ force: false })
  })
  test('--force', () => {
    expect(parseReleaseFinalizeArgs(['--force'])).toEqual({ force: true })
  })
  test('unknown flag throws', () => {
    expect(() => parseReleaseFinalizeArgs(['--bogus'])).toThrow(/--bogus/)
  })
  test('multiple --force is idempotent', () => {
    expect(parseReleaseFinalizeArgs(['--force', '--force'])).toEqual({ force: true })
  })
})
