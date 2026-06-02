import { describe, expect, test } from 'bun:test'
import { defineConfig } from '../src/config/index.ts'
import type { PromanConfig } from '../src/config/index.ts'

describe('defineConfig', () => {
  const input: PromanConfig = {
    name: '@ocas/workspace',
    runtime: 'bun',
    packages: [
      { name: '@ocas/core', path: 'packages/core' },
      { name: '@ocas/fs', path: 'packages/fs' },
      { name: '@ocas/cli', path: 'packages/cli' },
    ],
    changeset: { fixed: true },
    release: {
      registry: 'https://registry.npmjs.org',
      access: 'public',
      gitTagPrefix: 'v',
    },
  }

  test('returns input unchanged (reference + deep equality)', () => {
    const result = defineConfig(input)
    expect(result).toBe(input)
    expect(result).toEqual(input)
  })

  test('preserves all fields at runtime', () => {
    const r = defineConfig(input)
    expect(r.name).toBe('@ocas/workspace')
    expect(r.runtime).toBe('bun')
    expect(r.packages).toHaveLength(3)
    expect(r.changeset?.fixed).toBe(true)
    expect(r.release?.access).toBe('public')
  })
})
