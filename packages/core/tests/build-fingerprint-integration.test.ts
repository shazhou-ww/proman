/**
 * Integration tests for build fingerprint caching (fixes #135).
 *
 * Verifies that build fingerprints stored inside `dist/` are correctly
 * invalidated when the output directory is removed, and that incremental
 * builds skip unchanged packages.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { build } from '../src/commands/dev.ts'

let tmpDir: string

beforeEach(() => {
  tmpDir = resolve(
    tmpdir(),
    `proman-build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function setupMonorepo(): void {
  // Create proman.yaml config
  writeFileSync(
    join(tmpDir, 'proman.yaml'),
    `
packages:
  - name: '@test/pkg'
    path: packages/pkg
    type: lib
`,
  )

  // Create package
  mkdirSync(join(tmpDir, 'packages/pkg/src'), { recursive: true })
  writeFileSync(join(tmpDir, 'packages/pkg/src/index.ts'), 'export const x = 1')
  writeFileSync(
    join(tmpDir, 'packages/pkg/package.json'),
    JSON.stringify({ name: '@test/pkg', version: '1.0.0' }),
  )
  writeFileSync(join(tmpDir, 'packages/pkg/tsconfig.json'), '{}')
}

function setupMultiPackageMonorepo(): void {
  writeFileSync(
    join(tmpDir, 'proman.yaml'),
    `
packages:
  - name: '@test/core'
    path: packages/core
    type: lib
  - name: '@test/fs'
    path: packages/fs
    type: lib
  - name: '@test/cli'
    path: packages/cli
    type: cli
`,
  )

  // core — no workspace deps
  mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
  writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
  writeFileSync(
    join(tmpDir, 'packages/core/package.json'),
    JSON.stringify({ name: '@test/core', version: '1.0.0' }),
  )
  writeFileSync(join(tmpDir, 'packages/core/tsconfig.json'), '{}')

  // fs — depends on core
  mkdirSync(join(tmpDir, 'packages/fs/src'), { recursive: true })
  writeFileSync(join(tmpDir, 'packages/fs/src/index.ts'), 'export const y = 2')
  writeFileSync(
    join(tmpDir, 'packages/fs/package.json'),
    JSON.stringify({
      name: '@test/fs',
      version: '1.0.0',
      dependencies: { '@test/core': 'workspace:*' },
    }),
  )
  writeFileSync(join(tmpDir, 'packages/fs/tsconfig.json'), '{}')

  // cli — depends on fs
  mkdirSync(join(tmpDir, 'packages/cli/src'), { recursive: true })
  writeFileSync(join(tmpDir, 'packages/cli/src/index.ts'), 'export const z = 3')
  writeFileSync(
    join(tmpDir, 'packages/cli/package.json'),
    JSON.stringify({
      name: '@test/cli',
      version: '1.0.0',
      dependencies: { '@test/fs': 'workspace:*' },
    }),
  )
  writeFileSync(join(tmpDir, 'packages/cli/tsconfig.json'), '{}')
}

// Mock spawn function that simulates successful tsc builds
const mockSpawn = async (_argv: string[], cwd: string) => {
  // Simulate tsc build by creating dist folder with output
  const distDir = join(cwd, 'dist')
  mkdirSync(distDir, { recursive: true })

  // Create a simple index.js output
  const srcIndexPath = join(cwd, 'src/index.ts')
  if (existsSync(srcIndexPath)) {
    const content = readFileSync(srcIndexPath, 'utf-8')
    writeFileSync(join(distDir, 'index.js'), `// Compiled from TypeScript\n${content}`)
  }

  return { code: 0, stdout: 'Build succeeded', stderr: '' }
}

describe('Build Fingerprint Integration Tests (Issue #135)', () => {
  test('T1: Fingerprint stored inside dist folder', async () => {
    setupMonorepo()

    await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

    // Verify fingerprint is inside dist folder
    const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
    expect(existsSync(fpPath)).toBe(true)

    // Verify old location is NOT used
    const oldPath = join(tmpDir, '.proman/build/@test-pkg.fingerprint')
    expect(existsSync(oldPath)).toBe(false)

    // .proman directory should not be created
    expect(existsSync(join(tmpDir, '.proman'))).toBe(false)
  })

  test('T2: Removing dist invalidates fingerprint and forces rebuild', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      expect(existsSync(fpPath)).toBe(true)

      // Clear logs
      logs.length = 0

      // Second build without changes - should skip
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(true)

      // Remove dist folder
      rmSync(join(tmpDir, 'packages/pkg/dist'), { recursive: true })

      // Clear logs
      logs.length = 0

      // Third build - should rebuild (dist is gone)
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      // Should NOT skip (no skip log)
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // New fingerprint written
      expect(existsSync(fpPath)).toBe(true)
    } finally {
      console.log = originalLog
    }
  })

  test('T3: Unchanged source with intact dist skips build', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      const fpBefore = readFileSync(fpPath, 'utf-8')

      // Clear logs
      logs.length = 0

      // Second build without changes - should skip
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(true)

      // Fingerprint unchanged
      const fpAfter = readFileSync(fpPath, 'utf-8')
      expect(fpAfter).toBe(fpBefore)
    } finally {
      console.log = originalLog
    }
  })

  test('T4: Changed source invalidates fingerprint even with intact dist', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      const fpBefore = readFileSync(fpPath, 'utf-8')

      // Modify source
      writeFileSync(join(tmpDir, 'packages/pkg/src/index.ts'), 'export const x = 999')

      // Clear logs
      logs.length = 0

      // Second build with changed source - should rebuild
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      // Should NOT skip
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // New fingerprint written
      const fpAfter = readFileSync(fpPath, 'utf-8')
      expect(fpAfter).not.toBe(fpBefore)
    } finally {
      console.log = originalLog
    }
  })

  test('T5: Multiple packages each have fingerprints in their own dist', async () => {
    setupMultiPackageMonorepo()

    await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

    // Each package has fingerprint in its own dist
    expect(existsSync(join(tmpDir, 'packages/core/dist/.build-fingerprint'))).toBe(true)
    expect(existsSync(join(tmpDir, 'packages/fs/dist/.build-fingerprint'))).toBe(true)
    expect(existsSync(join(tmpDir, 'packages/cli/dist/.build-fingerprint'))).toBe(true)

    // No fingerprints in .proman/build directory
    expect(existsSync(join(tmpDir, '.proman/build'))).toBe(false)
  })

  test('T6: Dependency propagation still works with new location', async () => {
    setupMultiPackageMonorepo()

    // First build
    await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

    const coreFpBefore = readFileSync(
      join(tmpDir, 'packages/core/dist/.build-fingerprint'),
      'utf-8',
    )
    const fsFpBefore = readFileSync(join(tmpDir, 'packages/fs/dist/.build-fingerprint'), 'utf-8')
    const cliFpBefore = readFileSync(join(tmpDir, 'packages/cli/dist/.build-fingerprint'), 'utf-8')

    // Modify core's source
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 999')

    // Second build
    await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

    // All packages should have new fingerprints (dependency propagation)
    const coreFpAfter = readFileSync(join(tmpDir, 'packages/core/dist/.build-fingerprint'), 'utf-8')
    const fsFpAfter = readFileSync(join(tmpDir, 'packages/fs/dist/.build-fingerprint'), 'utf-8')
    const cliFpAfter = readFileSync(join(tmpDir, 'packages/cli/dist/.build-fingerprint'), 'utf-8')

    expect(coreFpAfter).not.toBe(coreFpBefore)
    expect(fsFpAfter).not.toBe(fsFpBefore)
    expect(cliFpAfter).not.toBe(cliFpBefore)
  })

  test('T7: Force flag bypasses cache regardless of fingerprint location', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      const _fpBefore = readFileSync(fpPath, 'utf-8')

      // Clear logs
      logs.length = 0

      // Second build with force - should rebuild
      await build({ cwd: tmpDir, force: true, spawn: mockSpawn })

      // Should NOT skip
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // Fingerprint is rewritten (even if content is the same)
      expect(existsSync(fpPath)).toBe(true)
    } finally {
      console.log = originalLog
    }
  })

  test('T8: CI mode always rebuilds and writes fingerprints', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build with force=false (enable fingerprints)
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      expect(existsSync(fpPath)).toBe(true)

      // Clear logs
      logs.length = 0

      // Second build with force=true (simulates CI mode) - should rebuild
      await build({ cwd: tmpDir, force: true, spawn: mockSpawn })

      // Should NOT skip (CI always rebuilds)
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // Fingerprint is still written (even in force mode)
      expect(existsSync(fpPath)).toBe(true)
    } finally {
      console.log = originalLog
    }
  })

  test('T9: Build failure does not write fingerprint', async () => {
    setupMonorepo()

    // Mock spawn that fails
    const failingSpawn = async () => {
      return { code: 1, stdout: '', stderr: 'Build failed' }
    }

    // Build should throw
    await expect(build({ cwd: tmpDir, force: false, spawn: failingSpawn })).rejects.toThrow()

    // No fingerprint written
    const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
    expect(existsSync(fpPath)).toBe(false)
  })

  test('T10: Partial dist deletion (missing fingerprint) forces rebuild', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      expect(existsSync(fpPath)).toBe(true)

      // Delete only fingerprint (keep dist folder)
      rmSync(fpPath)

      // Clear logs
      logs.length = 0

      // Second build - should rebuild (missing fingerprint)
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      // Should NOT skip (no skip log)
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // New fingerprint written
      expect(existsSync(fpPath)).toBe(true)
    } finally {
      console.log = originalLog
    }
  })

  test('T11: Deleting a single output file (dist intact, fingerprint intact) forces rebuild', async () => {
    setupMonorepo()
    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg: string) => {
      logs.push(msg)
      originalLog(msg)
    }

    try {
      // First build
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      const fpPath = join(tmpDir, 'packages/pkg/dist/.build-fingerprint')
      const distIndex = join(tmpDir, 'packages/pkg/dist/index.js')
      expect(existsSync(fpPath)).toBe(true)
      expect(existsSync(distIndex)).toBe(true)

      // Delete a single output file — keep dist/ dir and fingerprint
      rmSync(distIndex)
      expect(existsSync(distIndex)).toBe(false)
      expect(existsSync(fpPath)).toBe(true)

      // Clear logs
      logs.length = 0

      // Second build — should rebuild because output artifact is missing
      await build({ cwd: tmpDir, force: false, spawn: mockSpawn })

      // Should NOT skip — output file was missing
      expect(logs.some((log) => log.includes('⏭ build: @test/pkg (unchanged)'))).toBe(false)

      // Output file recreated
      expect(existsSync(distIndex)).toBe(true)

      // Fingerprint rewritten
      expect(existsSync(fpPath)).toBe(true)
    } finally {
      console.log = originalLog
    }
  })
})
