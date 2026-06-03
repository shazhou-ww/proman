import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { describe, expect, test } from 'vitest'
import { deploy } from '../src/commands/deploy.ts'
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

// typed fixture: runtime bun, no lockfile → packageManager npm → npm exec
describe('deploy command', () => {
  test('DEP1: typed fixture, no flags, deploys webui then api', async () => {
    const { spawn, calls } = makeSpawn()
    await deploy({ cwd: FIX('typed'), spawn })
    expect(calls).toHaveLength(2)
    // webui
    expect(calls[0]!.argv).toEqual(['npm', 'exec', 'wrangler', 'pages', 'deploy', 'dist'])
    expect(calls[0]!.cwd).toBe(resolve(FIX('typed'), 'packages/dashboard'))
    // api
    expect(calls[1]!.argv).toEqual(['npm', 'exec', 'wrangler', 'deploy'])
    expect(calls[1]!.cwd).toBe(resolve(FIX('typed'), 'packages/api'))
  })

  test('DEP2: --env staging appends to both', async () => {
    const { spawn, calls } = makeSpawn()
    await deploy({ cwd: FIX('typed'), spawn, env: 'staging' })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.argv).toEqual([
      'npm', 'exec', 'wrangler', 'pages', 'deploy', 'dist', '--env', 'staging',
    ])
    expect(calls[1]!.argv).toEqual(['npm', 'exec', 'wrangler', 'deploy', '--env', 'staging'])
  })

  test('DEP3: --package selects only one webui', async () => {
    const { spawn, calls } = makeSpawn()
    await deploy({ cwd: FIX('typed'), spawn, pkg: '@myapp/dashboard' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv).toEqual(['npm', 'exec', 'wrangler', 'pages', 'deploy', 'dist'])
    expect(calls[0]!.cwd).toBe(resolve(FIX('typed'), 'packages/dashboard'))
  })

  test('DEP4: --package on a lib throws not-deployable', async () => {
    const { spawn } = makeSpawn()
    await expect(
      deploy({ cwd: FIX('typed'), spawn, pkg: '@ocas/core' }),
    ).rejects.toThrow(/not deployable|cannot deploy/i)
  })

  test('DEP5: --package not found throws', async () => {
    const { spawn } = makeSpawn()
    await expect(
      deploy({ cwd: FIX('typed'), spawn, pkg: 'does-not-exist' }),
    ).rejects.toThrow(/not found|unknown package/i)
  })

  test('DEP6: no-deployable fixture, no flags → no spawn, no throw', async () => {
    const { spawn, calls } = makeSpawn()
    await deploy({ cwd: FIX('no-deployable'), spawn })
    expect(calls).toHaveLength(0)
  })

  test('DEP7: non-zero spawn exit throws', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(deploy({ cwd: FIX('typed'), spawn })).rejects.toThrow()
  })

  test('DEP8: --env production --package @myapp/api', async () => {
    const { spawn, calls } = makeSpawn()
    await deploy({
      cwd: FIX('typed'),
      spawn,
      pkg: '@myapp/api',
      env: 'production',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.argv).toEqual([
      'npm', 'exec', 'wrangler', 'deploy', '--env', 'production',
    ])
    expect(calls[0]!.cwd).toBe(resolve(FIX('typed'), 'packages/api'))
  })
})
