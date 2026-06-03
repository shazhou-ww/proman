import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { describe, expect, test } from 'vitest'
import { loadConfig } from '../src/config/index.ts'

const FIX = (name: string) => resolve(__dirname, 'fixtures', name)

describe('loadConfig', () => {
  test('happy path — loads issue example fixture', () => {
    const cfg = loadConfig(FIX('valid'))
    expect(cfg.packages).toHaveLength(3)
    expect(cfg.packages.map((p) => p.name)).toEqual(['@ocas/core', '@ocas/fs', '@ocas/cli'])
    expect(cfg.packageManager).toBe('pnpm')
    expect(cfg.changeset?.fixed).toBe(true)
    expect(cfg.release?.registry).toBe('https://registry.npmjs.org')
    expect(cfg.release?.access).toBe('public')
    expect(cfg.release?.gitTagPrefix).toBe('v')
  })

  test('applies registry + gitTagPrefix defaults when release omitted', () => {
    const cfg = loadConfig(FIX('defaults'))
    expect(cfg.packageManager).toBe('pnpm')
    expect(cfg.release?.registry).toBe('https://registry.npmjs.org')
    expect(cfg.release?.gitTagPrefix).toBe('v')
    expect(cfg.release?.access).toBeUndefined()
  })

  test('rejects when proman.yaml is missing', () => {
    expect(() => loadConfig(resolve(__dirname, 'fixtures', 'no-such-dir'))).toThrow(
      /proman\.yaml not found/,
    )
  })

  test('rejects empty packages', () => {
    expect(() => loadConfig(FIX('bad-packages'))).toThrow(/packages/i)
  })

  test('T5: defaults each package type to lib when omitted', () => {
    const cfg = loadConfig(FIX('valid'))
    for (const p of cfg.packages) {
      expect(p.type).toBe('lib')
    }
  })
})
