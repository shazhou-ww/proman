import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { SpawnFn } from './npm.js'
import { smokeTestTarball } from './smoke-test.js'

type Call = { argv: string[]; cwd: string }

/**
 * Recording mock SpawnFn. Returns a tarball filename for `pnpm pack`,
 * a configurable exit code for `pnpm install`, and success otherwise.
 */
function recordingSpawn(opts?: {
  packStdout?: string
  installCode?: number
  installStderr?: string
}): { spawn: SpawnFn; calls: Call[] } {
  const calls: Call[] = []
  const packStdout = opts?.packStdout ?? 'pkg-1.0.0.tgz'
  const spawn: SpawnFn = async (argv, cwd) => {
    calls.push({ argv: [...argv], cwd })
    if (argv[0] === 'pnpm' && argv[1] === 'pack') {
      return { code: 0, stdout: packStdout, stderr: '' }
    }
    if (argv[0] === 'pnpm' && argv[1] === 'install') {
      return { code: opts?.installCode ?? 0, stdout: '', stderr: opts?.installStderr ?? '' }
    }
    return { code: 0, stdout: '', stderr: '' }
  }
  return { spawn, calls }
}

describe('smokeTestTarball — install production deps before bin (#217)', () => {
  let pkgDir: string

  beforeEach(() => {
    pkgDir = join(
      tmpdir(),
      `proman-smoke-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(pkgDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(pkgDir)) rmSync(pkgDir, { recursive: true, force: true })
  })

  function writePkgJson(extra: Record<string, unknown>): void {
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'pkg', version: '1.0.0', ...extra }),
    )
  }

  test('runs `pnpm install --prod` in the extracted package dir before any bin --version', async () => {
    writePkgJson({
      bin: { pkg: './dist/cli.js' },
      dependencies: { '@ocas/cli-kit': '^0.2.0', zod: '^4.0.0' },
    })
    const { spawn, calls } = recordingSpawn()

    await smokeTestTarball(pkgDir, spawn)

    const installIdx = calls.findIndex((c) => c.argv.join(' ') === 'pnpm install --prod')
    const versionIdx = calls.findIndex((c) => c.argv.includes('--version'))

    // The exact command must be `pnpm install --prod` (pnpm, not npm; --prod present)
    expect(installIdx).toBeGreaterThanOrEqual(0)
    expect(versionIdx).toBeGreaterThanOrEqual(0)
    // Install must be ordered before the bin --version execution
    expect(installIdx).toBeLessThan(versionIdx)
    // Both run in the same extracted `package/` directory
    expect(calls[installIdx]?.cwd).toBe(calls[versionIdx]?.cwd)
    expect(calls[installIdx]?.cwd.split('/').pop()).toBe('package')
  })

  test('runs `pnpm install --prod` even when there are no external dependencies', async () => {
    writePkgJson({ bin: { pkg: './dist/cli.js' } })
    const { spawn, calls } = recordingSpawn()

    await smokeTestTarball(pkgDir, spawn)

    const installCalls = calls.filter((c) => c.argv.join(' ') === 'pnpm install --prod')
    expect(installCalls).toHaveLength(1)
  })

  test('aborts and does NOT run the bin when `pnpm install --prod` fails', async () => {
    writePkgJson({
      bin: { pkg: './dist/cli.js' },
      dependencies: { '@ocas/cli-kit': '^0.2.0' },
    })
    const { spawn, calls } = recordingSpawn({
      installCode: 1,
      installStderr: 'ERR_PNPM_NO_MATCHING_VERSION no matching version found',
    })

    let err: Error | undefined
    try {
      await smokeTestTarball(pkgDir, spawn)
    } catch (e) {
      err = e as Error
    }

    expect(err).toBeDefined()
    // Error identifies the install step and includes its output
    expect(err?.message).toMatch(/install/i)
    expect(err?.message).toContain('ERR_PNPM_NO_MATCHING_VERSION')
    // Bin --version must never be reached
    expect(calls.some((c) => c.argv.includes('--version'))).toBe(false)
  })

  test('cleans up the tarball even when `pnpm install --prod` fails', async () => {
    writePkgJson({ bin: { pkg: './dist/cli.js' } })
    const tgz = 'pkg-1.0.0.tgz'
    writeFileSync(join(pkgDir, tgz), 'dummy')
    const { spawn } = recordingSpawn({ packStdout: tgz, installCode: 1 })

    await expect(smokeTestTarball(pkgDir, spawn)).rejects.toThrow()

    // finally-block cleanup removes the tarball even on failure
    expect(existsSync(join(pkgDir, tgz))).toBe(false)
  })

  test('does not run install when the package has no bin entry', async () => {
    writePkgJson({ dependencies: { '@ocas/cli-kit': '^0.2.0' } })
    const { spawn, calls } = recordingSpawn()

    await smokeTestTarball(pkgDir, spawn)

    expect(calls).toHaveLength(0)
  })
})
