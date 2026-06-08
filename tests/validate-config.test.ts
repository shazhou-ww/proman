import { describe, expect, test } from 'vitest'
import { validateConfig } from '../src/config/index.ts'

const minimal = {
  packages: [{ name: '@x/a', path: 'packages/a' }],
}

describe('validateConfig', () => {
  test('accepts minimal valid config', () => {
    const r = validateConfig(minimal)
    expect(r.packages).toHaveLength(1)
  })

  test('rejects non-object input', () => {
    expect(() => validateConfig(null)).toThrow(/object/i)
    expect(() => validateConfig(undefined)).toThrow(/object/i)
    expect(() => validateConfig(42)).toThrow(/object/i)
  })

  test('ignores unknown changeset field (backward compat)', () => {
    // Old configs with changeset.fixed should not throw
    const r = validateConfig({ ...minimal, changeset: { fixed: true } })
    expect(r.packages).toHaveLength(1)
  })

  test('rejects invalid release.access', () => {
    expect(() =>
      validateConfig({
        ...minimal,
        release: { access: 'private' as unknown as 'public' },
      }),
    ).toThrow(/release\.access/)
  })

  test('T1: accepts each package type', () => {
    for (const t of ['lib', 'cli', 'webui', 'api'] as const) {
      const r = validateConfig({
        ...minimal,
        packages: [{ name: '@x/a', path: 'packages/a', type: t }],
      })
      expect(r.packages[0]?.type).toBe(t)
    }
  })

  test('T2: defaults type to lib when omitted', () => {
    const r = validateConfig(minimal)
    expect(r.packages[0]?.type).toBe('lib')
  })

  test('T3: rejects unknown type string', () => {
    expect(() =>
      validateConfig({
        ...minimal,
        packages: [{ name: '@x/a', path: 'packages/a', type: 'frontend' }],
      }),
    ).toThrow(/packages\[0\]\.type/)
  })

  test('T4: rejects non-string type', () => {
    expect(() =>
      validateConfig({
        ...minimal,
        packages: [{ name: '@x/a', path: 'packages/a', type: 1 as unknown as string }],
      }),
    ).toThrow(/packages\[0\]\.type/)
  })
})
