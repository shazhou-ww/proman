import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SpawnFn } from '../src/utils/npm.ts'
import { smokeTestTarball } from '../src/utils/smoke-test.ts'

let tmp: string

beforeEach(async () => {
  const { mkdtemp } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  tmp = await mkdtemp(join(tmpdir(), 'proman-smoke-'))
})

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(tmp, { recursive: true })
})

// ── Core smoke test: package with bin entry ──

describe('smoke test with bin entry', () => {
  test('extracts tarball and runs bin --version successfully', async () => {
    // Setup: create a minimal package structure with bin entry
    const pkgDir = join(tmp, 'test-pkg')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/cli',
      version: '1.0.0',
      bin: { testcli: './cli.js' },
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    // Create a minimal working CLI
    const cliScript = `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('1.0.0');
  process.exit(0);
}
`
    await writeFile(join(pkgDir, 'cli.js'), cliScript)

    // Mock spawn that simulates npm pack + successful bin execution
    const spawnCalls: string[] = []
    const mockSpawn: SpawnFn = async (argv, _cwd) => {
      const cmd = argv.join(' ')
      spawnCalls.push(cmd)

      if (cmd.startsWith('pnpm pack')) {
        // Return tarball filename
        return { code: 0, stdout: 'test-cli-1.0.0.tgz\n', stderr: '' }
      }

      if (cmd.includes('--version')) {
        // Simulate successful bin execution
        return { code: 0, stdout: '1.0.0\n', stderr: '' }
      }

      return { code: 0, stdout: '', stderr: '' }
    }

    // When: smoke test runs
    await smokeTestTarball(pkgDir, mockSpawn)

    // Then: npm pack was called, bin --version was executed
    expect(spawnCalls.some((c) => c.includes('pnpm pack'))).toBe(true)
    expect(spawnCalls.some((c) => c.includes('--version'))).toBe(true)
  })

  test('tests all bin entries when multiple exist', async () => {
    const pkgDir = join(tmp, 'multi-bin')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/tools',
      version: '1.0.0',
      bin: {
        'tool-a': './bin-a.js',
        'tool-b': './bin-b.js',
      },
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    const spawnCalls: string[] = []
    const mockSpawn: SpawnFn = async (argv) => {
      spawnCalls.push(argv.join(' '))
      if (argv.includes('pack')) {
        return { code: 0, stdout: 'test-tools-1.0.0.tgz\n', stderr: '' }
      }
      return { code: 0, stdout: '1.0.0\n', stderr: '' }
    }

    await smokeTestTarball(pkgDir, mockSpawn)

    // Should test both binaries
    expect(spawnCalls.some((c) => c.includes('bin-a.js'))).toBe(true)
    expect(spawnCalls.some((c) => c.includes('bin-b.js'))).toBe(true)
  })
})

// ── Error handling: abort on failure ──

describe('abort on smoke test failure', () => {
  test('throws error when bin command fails', async () => {
    const pkgDir = join(tmp, 'broken-pkg')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/broken',
      version: '1.0.0',
      bin: { broken: './cli.js' },
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    const mockSpawn: SpawnFn = async (argv) => {
      if (argv.includes('pack')) {
        return { code: 0, stdout: 'broken-1.0.0.tgz\n', stderr: '' }
      }
      // Simulate bin failure (e.g., missing file, broken import)
      if (argv.includes('--version')) {
        return {
          code: 1,
          stdout: '',
          stderr: "Error: Cannot find module './missing-dep.js'",
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    // Should throw with clear error message
    await expect(smokeTestTarball(pkgDir, mockSpawn)).rejects.toThrow('smoke test failed')
  })

  test('includes error output in thrown error', async () => {
    const pkgDir = join(tmp, 'error-pkg')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/error',
      version: '1.0.0',
      bin: { errcli: './cli.js' },
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    const mockSpawn: SpawnFn = async (argv) => {
      if (argv.includes('pack')) {
        return { code: 0, stdout: 'error-1.0.0.tgz\n', stderr: '' }
      }
      if (argv.includes('--version')) {
        return {
          code: 1,
          stdout: '',
          stderr: 'ENOENT: no such file or directory',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    await expect(smokeTestTarball(pkgDir, mockSpawn)).rejects.toThrow('ENOENT')
  })
})

// ── Edge case: no bin entry ──

describe('skip smoke test for packages without bin', () => {
  test('skips smoke test when no bin entry exists', async () => {
    const pkgDir = join(tmp, 'lib-pkg')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/lib',
      version: '1.0.0',
      // No bin entry
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    const spawnCalls: string[] = []
    const mockSpawn: SpawnFn = async (argv) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    }

    // Should complete without error and without calling npm pack
    await smokeTestTarball(pkgDir, mockSpawn)

    expect(spawnCalls.length).toBe(0)
  })

  test('skips when bin is empty object', async () => {
    const pkgDir = join(tmp, 'empty-bin')
    await mkdir(pkgDir, { recursive: true })

    const pkgJson = {
      name: '@test/empty',
      version: '1.0.0',
      bin: {},
    }
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

    const spawnCalls: string[] = []
    const mockSpawn: SpawnFn = async (argv) => {
      spawnCalls.push(argv.join(' '))
      return { code: 0, stdout: '', stderr: '' }
    }

    await smokeTestTarball(pkgDir, mockSpawn)

    expect(spawnCalls.length).toBe(0)
  })
})
