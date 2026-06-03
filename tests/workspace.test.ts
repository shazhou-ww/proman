import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type PkgManifest,
  applyWorkspaceRewrites,
  rewriteWorkspaceDeps,
} from '../src/utils/workspace.ts'

describe('rewriteWorkspaceDeps', () => {
  test('rewrites workspace:* in dependencies', () => {
    const a: PkgManifest = { name: 'A', version: '1.0.0', dependencies: { B: 'workspace:*' } }
    const b: PkgManifest = { name: 'B', version: '2.3.4' }
    const { rewritten, unresolved } = rewriteWorkspaceDeps([a, b])
    expect(rewritten[0]?.dependencies?.B).toBe('2.3.4')
    expect(unresolved).toEqual([])
  })

  test('rewrites workspace:* in devDependencies', () => {
    const a: PkgManifest = { name: 'A', version: '1.0.0', devDependencies: { B: 'workspace:*' } }
    const b: PkgManifest = { name: 'B', version: '2.3.4' }
    const { rewritten } = rewriteWorkspaceDeps([a, b])
    expect(rewritten[0]?.devDependencies?.B).toBe('2.3.4')
  })

  test('leaves non workspace:* deps untouched', () => {
    const a: PkgManifest = {
      name: 'A',
      version: '1.0.0',
      dependencies: {
        x: '^1.2.3',
        y: '1.0.0',
        z: 'npm:foo@1',
        w: 'file:../x',
      },
    }
    const { rewritten } = rewriteWorkspaceDeps([a])
    expect(rewritten[0]?.dependencies).toEqual({
      x: '^1.2.3',
      y: '1.0.0',
      z: 'npm:foo@1',
      w: 'file:../x',
    })
  })

  test('leaves unknown workspace:* and reports unresolved', () => {
    const a: PkgManifest = {
      name: 'A',
      version: '1.0.0',
      dependencies: { unknown: 'workspace:*' },
    }
    const b: PkgManifest = { name: 'B', version: '2.3.4' }
    const { rewritten, unresolved } = rewriteWorkspaceDeps([a, b])
    expect(rewritten[0]?.dependencies?.unknown).toBe('workspace:*')
    expect(unresolved).toEqual([{ pkg: 'A', dep: 'unknown' }])
  })

  test('does not mutate input objects', () => {
    const a: PkgManifest = { name: 'A', version: '1.0.0', dependencies: { B: 'workspace:*' } }
    const b: PkgManifest = { name: 'B', version: '2.3.4' }
    const aSnap = JSON.parse(JSON.stringify(a))
    const bSnap = JSON.parse(JSON.stringify(b))
    rewriteWorkspaceDeps([a, b])
    expect(a).toEqual(aSnap)
    expect(b).toEqual(bSnap)
  })

  test('handles missing dependencies / devDependencies fields', () => {
    const a: PkgManifest = { name: 'A', version: '1.0.0' }
    const { rewritten } = rewriteWorkspaceDeps([a])
    expect(rewritten[0]).not.toHaveProperty('dependencies')
    expect(rewritten[0]).not.toHaveProperty('devDependencies')
  })

  test('preserves unrelated fields', () => {
    const a: PkgManifest = {
      name: 'A',
      version: '1.0.0',
      scripts: { build: 'tsc' },
      description: 'desc',
      license: 'MIT',
      dependencies: { B: 'workspace:*' },
    }
    const b: PkgManifest = { name: 'B', version: '2.3.4' }
    const { rewritten } = rewriteWorkspaceDeps([a, b])
    expect(rewritten[0]?.scripts).toEqual({ build: 'tsc' })
    expect(rewritten[0]?.description).toBe('desc')
    expect(rewritten[0]?.license).toBe('MIT')
  })
})

describe('applyWorkspaceRewrites', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'proman-ws-'))
  })

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test('writes 2-space indent + trailing newline', async () => {
    await mkdir(join(tmp, 'packages/a'), { recursive: true })
    await mkdir(join(tmp, 'packages/b'), { recursive: true })
    const aPkg = { name: 'pkg-a', version: '0.2.0', dependencies: { 'pkg-b': 'workspace:*' } }
    const bPkg = { name: 'pkg-b', version: '0.2.0' }
    await writeFile(join(tmp, 'packages/a/package.json'), JSON.stringify(aPkg))
    await writeFile(join(tmp, 'packages/b/package.json'), JSON.stringify(bPkg))

    await applyWorkspaceRewrites(tmp, [
      { name: 'pkg-a', path: 'packages/a' },
      { name: 'pkg-b', path: 'packages/b' },
    ])

    const aText = await readFile(join(tmp, 'packages/a/package.json'), 'utf8')
    expect(aText.endsWith('\n')).toBe(true)
    expect(aText).toMatch(/^ {2}"/m)
    const aParsed = JSON.parse(aText)
    expect(aParsed.dependencies['pkg-b']).toBe('0.2.0')
  })

  test('returns only files actually changed', async () => {
    await mkdir(join(tmp, 'packages/a'), { recursive: true })
    await mkdir(join(tmp, 'packages/b'), { recursive: true })
    const aPkg = { name: 'pkg-a', version: '0.2.0', dependencies: { 'pkg-b': 'workspace:*' } }
    const bPkg = { name: 'pkg-b', version: '0.2.0', dependencies: { other: '^1.0.0' } }
    await writeFile(join(tmp, 'packages/a/package.json'), JSON.stringify(aPkg))
    const bText = JSON.stringify(bPkg)
    await writeFile(join(tmp, 'packages/b/package.json'), bText)
    const bBefore = await readFile(join(tmp, 'packages/b/package.json'))

    const changed = await applyWorkspaceRewrites(tmp, [
      { name: 'pkg-a', path: 'packages/a' },
      { name: 'pkg-b', path: 'packages/b' },
    ])

    expect(changed.some((p) => p.includes('packages/a/package.json'))).toBe(true)
    expect(changed.some((p) => p.includes('packages/b/package.json'))).toBe(false)
    const bAfter = await readFile(join(tmp, 'packages/b/package.json'))
    expect(bAfter.equals(bBefore)).toBe(true)
  })

  test('errors when a package.json is missing', async () => {
    await mkdir(join(tmp, 'packages/a'), { recursive: true })
    await writeFile(
      join(tmp, 'packages/a/package.json'),
      JSON.stringify({ name: 'pkg-a', version: '0.2.0' }),
    )
    await expect(
      applyWorkspaceRewrites(tmp, [
        { name: 'pkg-a', path: 'packages/a' },
        { name: 'pkg-missing', path: 'packages/missing' },
      ]),
    ).rejects.toThrow(/packages\/missing/)
    // also confirm a file is required
    await stat(join(tmp, 'packages/a/package.json'))
  })
})
