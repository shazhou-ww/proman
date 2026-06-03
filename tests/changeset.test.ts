import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildChangelogEntry,
  parseChangeset,
  prependChangelog,
  readChangesets,
} from '../src/utils/changeset.ts'

describe('parseChangeset', () => {
  test('parses single-package frontmatter', () => {
    const raw = `---\n'pkg-a': minor\n---\n\nAdd new API.\n`
    const cs = parseChangeset(raw, '/tmp/x.md')
    expect(cs.packages).toEqual({ 'pkg-a': 'minor' })
    expect(cs.body).toBe('Add new API.')
  })

  test('parses multi-package frontmatter (quoted and unquoted)', () => {
    const raw = `---\npkg-a: patch\n"pkg-b": minor\n---\nBody line.\n`
    const cs = parseChangeset(raw, '/tmp/x.md')
    expect(cs.packages).toEqual({ 'pkg-a': 'patch', 'pkg-b': 'minor' })
  })

  test('trims body of leading/trailing blank lines', () => {
    const raw = '---\npkg-a: patch\n---\n\n\nThe body.\n\n\n'
    const cs = parseChangeset(raw, '/tmp/x.md')
    expect(cs.body).toBe('The body.')
  })

  test('rejects unknown bump type', () => {
    const raw = '---\npkg-a: weird\n---\nbody\n'
    expect(() => parseChangeset(raw, '/tmp/x.md')).toThrow(/invalid bump/)
  })

  test('rejects missing frontmatter', () => {
    expect(() => parseChangeset('no frontmatter here', '/tmp/x.md')).toThrow(/frontmatter/)
  })

  test('stores file exactly as passed', () => {
    const raw = '---\npkg-a: patch\n---\nbody\n'
    const cs = parseChangeset(raw, '/abs/path/cs.md')
    expect(cs.file).toBe('/abs/path/cs.md')
  })
})

describe('readChangesets', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-cs-'))
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('returns empty array when .changeset/ does not exist', async () => {
    expect(await readChangesets(tmp)).toEqual([])
  })

  test('returns empty array when only config.json exists', async () => {
    await mkdir(join(tmp, '.changeset'))
    await writeFile(join(tmp, '.changeset/config.json'), '{}')
    expect(await readChangesets(tmp)).toEqual([])
  })

  test('lists only *.md (excludes config.json, README.md, non-md)', async () => {
    await mkdir(join(tmp, '.changeset'))
    await writeFile(join(tmp, '.changeset/funny-fox.md'), '---\npkg-a: minor\n---\nA\n')
    await writeFile(join(tmp, '.changeset/brave-bear.md'), '---\npkg-b: patch\n---\nB\n')
    await writeFile(join(tmp, '.changeset/config.json'), '{}')
    await writeFile(join(tmp, '.changeset/README.md'), 'readme')
    await writeFile(join(tmp, '.changeset/notes.txt'), 'x')
    const cs = await readChangesets(tmp)
    expect(cs.length).toBe(2)
    expect(cs.map((c) => c.file.split('/').pop())).toEqual(['brave-bear.md', 'funny-fox.md'])
  })

  test('sorts results by filename', async () => {
    await mkdir(join(tmp, '.changeset'))
    await writeFile(join(tmp, '.changeset/zebra.md'), '---\npkg-a: minor\n---\nZ\n')
    await writeFile(join(tmp, '.changeset/alpha.md'), '---\npkg-a: minor\n---\nA\n')
    const cs = await readChangesets(tmp)
    expect(cs.map((c) => c.file.split('/').pop())).toEqual(['alpha.md', 'zebra.md'])
  })

  test('throws on .md without frontmatter', async () => {
    await mkdir(join(tmp, '.changeset'))
    await writeFile(join(tmp, '.changeset/bad.md'), 'no frontmatter here\n')
    await expect(readChangesets(tmp)).rejects.toThrow(/frontmatter/)
  })
})

describe('buildChangelogEntry', () => {
  test('single body', () => {
    const out = buildChangelogEntry({ version: '0.3.0', date: '2026-06-02', bodies: ['Add API.'] })
    expect(out).toBe('## 0.3.0 — 2026-06-02\n\n- Add API.\n\n')
  })

  test('multi-line body uses two-space continuation indent', () => {
    const out = buildChangelogEntry({
      version: '0.3.0',
      date: '2026-06-02',
      bodies: ['L1\nL2'],
    })
    expect(out).toContain('- L1\n  L2')
  })

  test('multiple bodies become multiple bullets in order', () => {
    const out = buildChangelogEntry({
      version: '0.3.0',
      date: '2026-06-02',
      bodies: ['First', 'Second'],
    })
    const firstIdx = out.indexOf('- First')
    const secondIdx = out.indexOf('- Second')
    expect(firstIdx).toBeGreaterThan(0)
    expect(secondIdx).toBeGreaterThan(firstIdx)
  })
})

describe('prependChangelog', () => {
  test('null existing yields # Changelog header + entry', () => {
    const out = prependChangelog(null, '## 0.3.0 — 2026-06-02\n\n- A\n\n')
    expect(out).toBe('# Changelog\n\n## 0.3.0 — 2026-06-02\n\n- A\n\n')
  })

  test('inserts entry after existing # Changelog heading', () => {
    const existing = '# Changelog\n\n## 0.2.0 — 2025-01-01\n\n- old\n'
    const out = prependChangelog(existing, '## 0.3.0 — 2026-06-02\n\n- new\n\n')
    expect(out.startsWith('# Changelog\n\n## 0.3.0 — 2026-06-02')).toBe(true)
    expect(out).toContain('## 0.2.0')
    expect(out).toContain('- old')
  })

  test('no heading: prepends entry above existing content', () => {
    const existing = 'just some text\n'
    const out = prependChangelog(existing, '## 0.3.0 — 2026-06-02\n\n- n\n\n')
    expect(out.startsWith('## 0.3.0')).toBe(true)
    expect(out).toContain('just some text')
  })

  test('empty existing treated like null', () => {
    const out = prependChangelog('', '## 0.3.0\n\n- n\n\n')
    expect(out.startsWith('# Changelog')).toBe(true)
  })
})
