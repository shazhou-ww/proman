import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { build, check, format, runTests } from '../src/commands/dev.ts'
import type { SpawnFn } from '../src/utils/npm.ts'

const FIX = (name: string) => resolve(import.meta.dir, 'fixtures', name)

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
  test('C1: runs build script in each package dir in order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(3) // core, fs, cli
    expect(calls[0]!.argv).toEqual(['bun', 'run', 'build'])
    expect(calls[0]!.cwd).toBe(resolve(FIX('valid'), 'packages/core'))
    expect(calls[1]!.cwd).toBe(resolve(FIX('valid'), 'packages/fs'))
    expect(calls[2]!.cwd).toBe(resolve(FIX('valid'), 'packages/cli'))
  })

  test('C1b: node runtime uses npm run build', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1) // node-runtime fixture has 1 package
    expect(calls[0]!.argv).toEqual(['npm', 'run', 'build'])
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
