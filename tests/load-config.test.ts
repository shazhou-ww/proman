import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { loadConfig } from '../src/config/index.ts'

const FIX = (name: string) => resolve(import.meta.dir, 'fixtures', name)

describe('loadConfig', () => {
  test('happy path — loads issue example fixture', async () => {
    const cfg = await loadConfig(FIX('valid'))
    expect(cfg.name).toBe('@ocas/workspace')
    expect(cfg.runtime).toBe('bun')
    expect(cfg.packages).toHaveLength(3)
    expect(cfg.packages.map((p) => p.name)).toEqual(['@ocas/core', '@ocas/fs', '@ocas/cli'])
    expect(cfg.changeset?.fixed).toBe(true)
    expect(cfg.release?.registry).toBe('https://registry.npmjs.org')
    expect(cfg.release?.access).toBe('public')
    expect(cfg.release?.gitTagPrefix).toBe('v')
  })

  test('applies registry + gitTagPrefix defaults when release omitted', async () => {
    const cfg = await loadConfig(FIX('defaults'))
    expect(cfg.release?.registry).toBe('https://registry.npmjs.org')
    expect(cfg.release?.gitTagPrefix).toBe('v')
    expect(cfg.release?.access).toBeUndefined()
  })

  test('rejects when proman.config.ts is missing', async () => {
    await expect(loadConfig(resolve(import.meta.dir, 'fixtures', 'no-such-dir'))).rejects.toThrow(
      /proman\.config\.ts not found/,
    )
  })

  test('rejects invalid runtime', async () => {
    await expect(loadConfig(FIX('bad-runtime'))).rejects.toThrow(/runtime/i)
  })

  test('rejects missing name', async () => {
    await expect(loadConfig(FIX('missing-name'))).rejects.toThrow(/name/i)
  })

  test('rejects empty packages', async () => {
    await expect(loadConfig(FIX('bad-packages'))).rejects.toThrow(/packages/i)
  })
})
