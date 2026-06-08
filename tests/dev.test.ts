import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { build, check, format, runTests } from '../src/commands/dev.ts'
import type { SpawnFn } from '../src/utils/npm.ts'

const FIX = (name: string) => resolve(__dirname, 'fixtures', name)

type Call = { argv: string[]; cwd: string }

function makeSpawn(code = 0, stdout = '', stderr = '') {
  const calls: Call[] = []
  const fn: SpawnFn = async (argv, cwd) => {
    calls.push({ argv, cwd })
    return { code, stdout, stderr }
  }
  return { spawn: fn, calls }
}

/** Check that argv contains `pm exec bin` pattern */
function expectExec(argv: string[], bin: string, args: string[]) {
  const binIdx = argv.indexOf(bin)
  expect(binIdx).toBeGreaterThanOrEqual(0)
  for (let i = 0; i < args.length; i++) {
    expect(argv[binIdx + 1 + i]).toBe(args[i])
  }
}

describe('build command', () => {
  test('C1: dispatches tsc --build per package in order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(3) // core, fs, cli
    for (const c of calls) {
      expect(c.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
      expectExec(c.argv, 'tsc', ['--build'])
    }
    expect(calls[0]?.cwd).toBe(resolve(FIX('valid'), 'packages/core'))
    expect(calls[1]?.cwd).toBe(resolve(FIX('valid'), 'packages/fs'))
    expect(calls[2]?.cwd).toBe(resolve(FIX('valid'), 'packages/cli'))
  })

  test('C1b: node-runtime uses pnpm exec tsc --build', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
  })

  test('C1c: pnpm project uses pnpm exec tsc --build', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
  })

  test('C1d: typed fixture dispatches by type in declared order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('typed'), spawn })
    expect(calls).toHaveLength(4)
    // lib: tsc --build
    expectExec(calls[0]?.argv, 'tsc', ['--build'])
    expect(calls[0]?.cwd).toBe(resolve(FIX('typed'), 'packages/core'))
    // cli: tsc --build
    expectExec(calls[1]?.argv, 'tsc', ['--build'])
    expect(calls[1]?.cwd).toBe(resolve(FIX('typed'), 'packages/mycli'))
    // webui: vite build
    expectExec(calls[2]?.argv, 'vite', ['build'])
    expect(calls[2]?.cwd).toBe(resolve(FIX('typed'), 'packages/dashboard'))
    // api: tsc --build
    expectExec(calls[3]?.argv, 'tsc', ['--build'])
    expect(calls[3]?.cwd).toBe(resolve(FIX('typed'), 'packages/api'))
  })

  test('C-bin: webui uses pnpm exec vite', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('webui-only'), spawn })
    expect(calls).toHaveLength(1)
    expectExec(calls[0]?.argv, 'vite', ['build'])
  })

  test('C-pnpm: uses pnpm exec', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls[0]?.argv[0]).toBe('pnpm')
    expect(calls[0]?.argv[1]).toBe('exec')
  })

  test('C6: build throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'build error')
    await expect(build({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('test command', () => {
  test('C2: invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    const { argv, cwd } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
    expect(cwd).toBe(FIX('valid'))
  })

  test('C3: node-runtime invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    const { argv } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
  })

  test('C3b: pnpm project invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    const { argv } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
  })

  test('C6: test throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(runTests({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('check command', () => {
  test('C4: invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C4b: valid fixture invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C4c: pnpm project invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C6: check throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(check({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('format command', () => {
  test('C5: invokes pnpm exec biome format --write .', async () => {
    const { spawn, calls } = makeSpawn()
    await format({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'format', '--write', '.'])
  })

  test('C6: format throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(format({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

// ── chmod +x bin entries after build ────────────────────────────────────────

describe('build — chmod +x bin entries', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `proman-chmod-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTmpProject(bins: Record<string, string> | string | undefined): {
    cwd: string
    spawn: SpawnFn
  } {
    const pkgDir = join(tmpDir, 'packages', 'mycli')
    const distDir = join(pkgDir, 'dist')
    mkdirSync(distDir, { recursive: true })

    // proman.yaml
    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/cli"\n    path: packages/mycli\n    type: cli\n',
    )

    // package.json with bin
    const pkgJson: Record<string, unknown> = { name: '@test/cli', version: '1.0.0' }
    if (bins !== undefined) pkgJson.bin = bins
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkgJson))

    // Mock spawn that recreates dist/cli.js with 644 (simulates tsc output)
    const spawn: SpawnFn = async (_argv, cwd) => {
      const out = join(cwd, 'dist')
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, 'cli.js'), '#!/usr/bin/env node\n')
      chmodSync(join(out, 'cli.js'), 0o644)
      return { code: 0, stdout: '', stderr: '' }
    }

    return { cwd: tmpDir, spawn }
  }

  test('B1: bin object — chmod +x applied after build', async () => {
    const { cwd, spawn } = writeTmpProject({ mycli: './dist/cli.js' })
    await build({ cwd, spawn })

    const mode = statSync(join(cwd, 'packages/mycli/dist/cli.js')).mode & 0o777
    expect(mode).toBe(0o755)
  })

  test('B2: bin string — chmod +x applied after build', async () => {
    const { cwd, spawn } = writeTmpProject('./dist/cli.js')
    await build({ cwd, spawn })

    const mode = statSync(join(cwd, 'packages/mycli/dist/cli.js')).mode & 0o777
    expect(mode).toBe(0o755)
  })

  test('B3: no bin field — no crash', async () => {
    const { cwd, spawn } = writeTmpProject(undefined)
    await build({ cwd, spawn })
    // Should not throw
  })

  test('B4: bin points to missing file — no crash', async () => {
    const { cwd, spawn } = writeTmpProject({ mycli: './dist/nonexistent.js' })
    await build({ cwd, spawn })
    // Should not throw
  })
})
