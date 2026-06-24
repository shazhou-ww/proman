import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  computeBuildFingerprints,
  computeRootFingerprint,
  fingerprintPath,
  hashFiles,
  pkgNameToFilename,
  readFingerprint,
  writeFingerprint,
} from '../src/utils/fingerprint.ts'

let tmpDir: string

beforeEach(() => {
  tmpDir = resolve(tmpdir(), `proman-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('hashFiles', () => {
  test('F1: deterministic — same content → same hash', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const x = 1')

    const hash1 = hashFiles(tmpDir, ['**/*.ts'])
    const hash2 = hashFiles(tmpDir, ['**/*.ts'])

    expect(hash1).toBeTruthy()
    expect(hash1).toBe(hash2)
  })

  test('F2: content-sensitive — different content → different hash', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const x = 1')
    const hash1 = hashFiles(tmpDir, ['**/*.ts'])

    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const x = 2')
    const hash2 = hashFiles(tmpDir, ['**/*.ts'])

    expect(hash1).not.toBe(hash2)
  })

  test('F3: order-independent — file discovery order does not matter', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'b.ts'), 'export const b = 2')
    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const a = 1')

    const hash1 = hashFiles(tmpDir, ['**/*.ts'])
    const hash2 = hashFiles(tmpDir, ['**/*.ts'])

    expect(hash1).toBe(hash2)
  })

  test('F4: content-based, not mtime-based — touch without change keeps same hash', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const x = 1')

    const hash1 = hashFiles(tmpDir, ['**/*.ts'])

    // Touch the file (update mtime but not content)
    const future = new Date(Date.now() + 60000)
    utimesSync(join(tmpDir, 'src', 'a.ts'), future, future)

    const hash2 = hashFiles(tmpDir, ['**/*.ts'])

    expect(hash1).toBe(hash2)
  })

  test('F5: ignores non-matching files', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src', 'a.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'readme.md'), '# README')

    const hash1 = hashFiles(tmpDir, ['**/*.ts'])

    writeFileSync(join(tmpDir, 'another.md'), '# Another')

    const hash2 = hashFiles(tmpDir, ['**/*.ts'])

    expect(hash1).toBe(hash2)
  })
})

describe('readFingerprint / writeFingerprint', () => {
  test('F6: readFingerprint returns null when file missing', () => {
    expect(readFingerprint(join(tmpDir, 'nonexistent', 'fp'))).toBeNull()
  })

  test('F7: round-trip — write then read returns same value', () => {
    const fpPath = join(tmpDir, 'test.fingerprint')
    writeFingerprint(fpPath, { hash: 'abc123' })
    expect(readFingerprint(fpPath)?.hash).toBe('abc123')
  })

  test('F8: writeFingerprint creates parent directories', () => {
    const fpPath = join(tmpDir, 'deep', 'nested', 'dir', 'fp')
    writeFingerprint(fpPath, { hash: 'hash' })
    expect(existsSync(fpPath)).toBe(true)
    expect(readFingerprint(fpPath)?.hash).toBe('hash')
  })
})

describe('pkgNameToFilename / fingerprintPath', () => {
  test('F-san1: pkgNameToFilename converts @scope/name → @scope-name', () => {
    expect(pkgNameToFilename('@ocas/core')).toBe('@ocas-core')
    expect(pkgNameToFilename('@test/cli')).toBe('@test-cli')
  })

  test('F-san2: fingerprintPath round-trip for scoped package names (non-build commands)', () => {
    // Test with deploy command (non-build command should still use old .proman path)
    const fpPath = fingerprintPath(tmpDir, 'deploy', '@ocas/core')
    writeFingerprint(fpPath, { hash: 'x' })
    expect(readFingerprint(fpPath)?.hash).toBe('x')
    expect(fpPath).toContain('@ocas-core.fingerprint')
  })

  test('F-san3: fingerprintPath with no pkgName uses root.fingerprint', () => {
    const fpPath = fingerprintPath(tmpDir, 'test')
    expect(fpPath).toContain('root.fingerprint')
  })

  test('F-san4: fingerprintPath for build command returns path inside package dist folder', () => {
    const pkgDir = join(tmpDir, 'packages/pkg')
    const fpPath = fingerprintPath(pkgDir, 'build', '@test/pkg')
    expect(fpPath).toBe(join(pkgDir, 'dist/.build-fingerprint'))
  })

  test('F-san5: fingerprintPath for test/check commands returns path in .proman', () => {
    const testFpPath = fingerprintPath(tmpDir, 'test')
    expect(testFpPath).toBe(join(tmpDir, '.proman/test/root.fingerprint'))

    const checkFpPath = fingerprintPath(tmpDir, 'check')
    expect(checkFpPath).toBe(join(tmpDir, '.proman/check/root.fingerprint'))
  })
})

describe('computeBuildFingerprints', () => {
  function writeMonorepo(root: string): void {
    // core — no workspace deps
    mkdirSync(join(root, 'packages/core/src'), { recursive: true })
    writeFileSync(join(root, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(
      join(root, 'packages/core/package.json'),
      JSON.stringify({ name: '@test/core', version: '1.0.0' }),
    )
    writeFileSync(join(root, 'packages/core/tsconfig.json'), '{}')

    // fs — depends on core
    mkdirSync(join(root, 'packages/fs/src'), { recursive: true })
    writeFileSync(join(root, 'packages/fs/src/index.ts'), 'export const y = 2')
    writeFileSync(
      join(root, 'packages/fs/package.json'),
      JSON.stringify({
        name: '@test/fs',
        version: '1.0.0',
        dependencies: { '@test/core': 'workspace:*' },
      }),
    )
    writeFileSync(join(root, 'packages/fs/tsconfig.json'), '{}')

    // cli — depends on fs
    mkdirSync(join(root, 'packages/cli/src'), { recursive: true })
    writeFileSync(join(root, 'packages/cli/src/index.ts'), 'export const z = 3')
    writeFileSync(
      join(root, 'packages/cli/package.json'),
      JSON.stringify({
        name: '@test/cli',
        version: '1.0.0',
        dependencies: { '@test/fs': 'workspace:*' },
      }),
    )
    writeFileSync(join(root, 'packages/cli/tsconfig.json'), '{}')
  }

  test('F9: returns per-package fingerprints', () => {
    writeMonorepo(tmpDir)
    const packages = [
      { name: '@test/core', path: 'packages/core', type: 'lib' as const },
      { name: '@test/fs', path: 'packages/fs', type: 'lib' as const },
      { name: '@test/cli', path: 'packages/cli', type: 'cli' as const },
    ]

    const fps = computeBuildFingerprints(tmpDir, packages)

    expect(fps.size).toBe(3)
    expect(fps.get('@test/core')).toBeTruthy()
    expect(fps.get('@test/fs')).toBeTruthy()
    expect(fps.get('@test/cli')).toBeTruthy()
  })

  test('F10: dependency propagation — changing leaf invalidates dependents', () => {
    writeMonorepo(tmpDir)
    const packages = [
      { name: '@test/core', path: 'packages/core', type: 'lib' as const },
      { name: '@test/fs', path: 'packages/fs', type: 'lib' as const },
      { name: '@test/cli', path: 'packages/cli', type: 'cli' as const },
    ]

    const before = computeBuildFingerprints(tmpDir, packages)

    // Modify core's source
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 999')

    const after = computeBuildFingerprints(tmpDir, packages)

    // core changed directly
    expect(before.get('@test/core')).not.toBe(after.get('@test/core'))
    // fs changed transitively (depends on core)
    expect(before.get('@test/fs')).not.toBe(after.get('@test/fs'))
    // cli changed transitively (depends on fs → core)
    expect(before.get('@test/cli')).not.toBe(after.get('@test/cli'))
  })

  test('F11: changing leaf does NOT invalidate unrelated packages', () => {
    writeMonorepo(tmpDir)

    // Add an unrelated package (util, no deps)
    mkdirSync(join(tmpDir, 'packages/util/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/util/src/index.ts'), 'export const u = 0')
    writeFileSync(
      join(tmpDir, 'packages/util/package.json'),
      JSON.stringify({ name: '@test/util', version: '1.0.0' }),
    )
    writeFileSync(join(tmpDir, 'packages/util/tsconfig.json'), '{}')

    const packages = [
      { name: '@test/core', path: 'packages/core', type: 'lib' as const },
      { name: '@test/fs', path: 'packages/fs', type: 'lib' as const },
      { name: '@test/cli', path: 'packages/cli', type: 'cli' as const },
      { name: '@test/util', path: 'packages/util', type: 'lib' as const },
    ]

    const before = computeBuildFingerprints(tmpDir, packages)

    // Modify core's source
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 888')

    const after = computeBuildFingerprints(tmpDir, packages)

    // core changed
    expect(before.get('@test/core')).not.toBe(after.get('@test/core'))
    // util unchanged (no dep on core)
    expect(before.get('@test/util')).toBe(after.get('@test/util'))
  })
})

describe('computeRootFingerprint', () => {
  test('F12: test fingerprint includes src and tests', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    mkdirSync(join(tmpDir, 'tests'), { recursive: true })
    writeFileSync(join(tmpDir, 'src/a.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'tests/a.test.ts'), 'test("a", () => {})')
    writeFileSync(join(tmpDir, 'package.json'), '{}')

    const hash1 = computeRootFingerprint(tmpDir, 'test')

    writeFileSync(join(tmpDir, 'tests/a.test.ts'), 'test("b", () => {})')

    const hash2 = computeRootFingerprint(tmpDir, 'test')

    expect(hash1).not.toBe(hash2)
  })

  test('F13: check fingerprint includes biome.json', () => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src/a.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    writeFileSync(join(tmpDir, 'biome.json'), '{ "linter": {} }')

    const hash1 = computeRootFingerprint(tmpDir, 'check')

    writeFileSync(join(tmpDir, 'biome.json'), '{ "linter": { "enabled": false } }')

    const hash2 = computeRootFingerprint(tmpDir, 'check')

    expect(hash1).not.toBe(hash2)
  })
})

describe('Fingerprint storage inside build output (Issue #135)', () => {
  test('T1: Fingerprint stored inside dist folder', () => {
    const pkgDir = join(tmpDir, 'packages/pkg')
    mkdirSync(join(pkgDir, 'src'), { recursive: true })
    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'src/index.ts'), 'export const x = 1')
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@test/pkg' }))

    // Write fingerprint using new location
    const fpPath = fingerprintPath(pkgDir, 'build', '@test/pkg')
    writeFingerprint(fpPath, { hash: 'abc123' })

    // Verify it's inside dist folder
    expect(fpPath).toBe(join(pkgDir, 'dist/.build-fingerprint'))
    expect(existsSync(fpPath)).toBe(true)

    // Verify old location is NOT used
    const oldPath = join(tmpDir, '.proman/build/@test-pkg.fingerprint')
    expect(existsSync(oldPath)).toBe(false)
  })

  test('T2: Test and check fingerprints still use .proman directory', () => {
    // Test command fingerprint
    const testFpPath = fingerprintPath(tmpDir, 'test')
    expect(testFpPath).toBe(join(tmpDir, '.proman/test/root.fingerprint'))

    // Check command fingerprint
    const checkFpPath = fingerprintPath(tmpDir, 'check')
    expect(checkFpPath).toBe(join(tmpDir, '.proman/check/root.fingerprint'))
  })
})
