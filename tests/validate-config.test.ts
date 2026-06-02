import { describe, expect, test } from 'bun:test'
import { validateConfig } from '../src/config/index.ts'

const minimal = {
  name: '@x/workspace',
  runtime: 'bun' as const,
  packages: [{ name: '@x/a', path: 'packages/a' }],
}

describe('validateConfig', () => {
  test('accepts minimal valid config', () => {
    const r = validateConfig(minimal)
    expect(r.name).toBe('@x/workspace')
    expect(r.runtime).toBe('bun')
    expect(r.packages).toHaveLength(1)
  })

  test('rejects non-object input', () => {
    expect(() => validateConfig(null)).toThrow(/object/i)
    expect(() => validateConfig(undefined)).toThrow(/object/i)
    expect(() => validateConfig(42)).toThrow(/object/i)
  })

  test('rejects unknown runtime literal', () => {
    expect(() => validateConfig({ ...minimal, runtime: 'deno' })).toThrow(/runtime/i)
  })

  test('rejects non-boolean changeset.fixed', () => {
    expect(() =>
      validateConfig({ ...minimal, changeset: { fixed: 'yes' as unknown as boolean } }),
    ).toThrow(/changeset\.fixed/)
  })

  test('rejects invalid release.access', () => {
    expect(() =>
      validateConfig({
        ...minimal,
        release: { access: 'private' as unknown as 'public' },
      }),
    ).toThrow(/release\.access/)
  })
})
