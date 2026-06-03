import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { describe, expect, test } from 'vitest'
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

describe('build command', () => {
  test('C1: dispatches tsc --build per package in order (default lib)', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(3) // core, fs, cli
    for (const c of calls) {
      expect(c.argv[0]).toMatch(/tsc$/)
      expect(c.argv[1]).toBe('--build')
    }
    expect(calls[0]!.cwd).toBe(resolve(FIX('valid'), 'packages/core'))
    expect(calls[1]!.cwd).toBe(resolve(FIX('valid'), 'packages/fs'))
    expect(calls[2]!.cwd).toBe(resolve(FIX('valid'), 'packages/cli'))
  })

  test('C1b: node-runtime fixture also dispatches tsc --build (default lib)', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv[0]).toMatch(/tsc$/)
    expect(calls[0]!.argv[1]).toBe('--build')
  })

  test('C1c: typed fixture dispatches by type in declared order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('typed'), spawn })
    expect(calls).toHaveLength(4)
    // lib: tsc --build
    expect(calls[0]!.argv[0]).toMatch(/tsc$/)
    expect(calls[0]!.argv[1]).toBe('--build')
    expect(calls[0]!.cwd).toBe(resolve(FIX('typed'), 'packages/core'))
    // cli: tsc --build
    expect(calls[1]!.argv[0]).toMatch(/tsc$/)
    expect(calls[1]!.argv[1]).toBe('--build')
    expect(calls[1]!.cwd).toBe(resolve(FIX('typed'), 'packages/mycli'))
    // webui: vite build
    expect(calls[2]!.argv[0]).toMatch(/vite$/)
    expect(calls[2]!.argv[1]).toBe('build')
    expect(calls[2]!.cwd).toBe(resolve(FIX('typed'), 'packages/dashboard'))
    // api: tsc --build
    expect(calls[3]!.argv[0]).toMatch(/tsc$/)
    expect(calls[3]!.argv[1]).toBe('--build')
    expect(calls[3]!.cwd).toBe(resolve(FIX('typed'), 'packages/api'))
  })

  test('C-bin: webui uses findBin(vite)', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('webui-only'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv[0]).toMatch(/vite$/)
  })

  test('C6: build throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'build error')
    await expect(build({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('test command', () => {
  test('C2: bun runtime invokes bun test', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    const { argv, cwd } = calls[0] as Call
    expect(argv).toEqual(['bun', 'test'])
    expect(cwd).toBe(FIX('valid'))
  })

  test('C3: node runtime invokes npm test', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    const { argv } = calls[0] as Call
    expect(argv).toEqual(['npm', 'test'])
  })

  test('C6: test throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(runTests({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('check command', () => {
  test('C4: invokes biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    const { argv, cwd } = calls[0] as Call
    expect(argv[0]).toMatch(/biome$/)
    expect(argv[1]).toBe('check')
    expect(argv[2]).toBe('.')
    expect(cwd).toBe(FIX('valid'))
  })

  test('C6: check throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(check({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('format command', () => {
  test('C5: invokes biome format --write .', async () => {
    const { spawn, calls } = makeSpawn()
    await format({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    const { argv, cwd } = calls[0] as Call
    expect(argv[0]).toMatch(/biome$/)
    expect(argv[1]).toBe('format')
    expect(argv[2]).toBe('--write')
    expect(argv[3]).toBe('.')
    expect(cwd).toBe(FIX('valid'))
  })

  test('C6: format throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(format({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})
