import { describe, expect, test } from 'vitest'
import type { Changeset } from '../src/utils/changeset.ts'
import { bumpVersion, inferBump, parseTagVersion } from '../src/utils/version.ts'

describe('bumpVersion', () => {
  test('patch/minor/major from 0.2.0', () => {
    expect(bumpVersion('0.2.0', 'patch')).toBe('0.2.1')
    expect(bumpVersion('0.2.0', 'minor')).toBe('0.3.0')
    expect(bumpVersion('0.2.0', 'major')).toBe('1.0.0')
  })

  test('patch/minor/major from 1.4.7', () => {
    expect(bumpVersion('1.4.7', 'patch')).toBe('1.4.8')
    expect(bumpVersion('1.4.7', 'minor')).toBe('1.5.0')
    expect(bumpVersion('1.4.7', 'major')).toBe('2.0.0')
  })

  test('strips pre-release suffix', () => {
    expect(bumpVersion('0.2.0-rc.1', 'patch')).toBe('0.2.1')
  })

  test('throws on invalid input', () => {
    expect(() => bumpVersion('abc', 'patch')).toThrow(/invalid version/i)
    expect(() => bumpVersion('', 'patch')).toThrow(/invalid version/i)
    expect(() => bumpVersion('1.2', 'patch')).toThrow(/invalid version/i)
    expect(() => bumpVersion('1.2.3.4', 'patch')).toThrow(/invalid version/i)
  })
})

function cs(packages: Record<string, 'major' | 'minor' | 'patch'>, file = 'foo.md'): Changeset {
  return { file, packages, body: '' }
}

describe('inferBump', () => {
  test('empty list → null', () => {
    expect(inferBump([], false)).toBeNull()
    expect(inferBump([], true)).toBeNull()
  })

  test('all-empty package records → null', () => {
    expect(inferBump([cs({}), cs({}, 'b.md')], false)).toBeNull()
    expect(inferBump([cs({}), cs({}, 'b.md')], true)).toBeNull()
  })

  test('global highest fixed=true: patch+minor → minor', () => {
    expect(inferBump([cs({ a: 'patch' }), cs({ b: 'minor' }, 'b.md')], true)).toBe('minor')
  })

  test('global highest fixed=true: minor+major → major', () => {
    expect(inferBump([cs({ a: 'minor' }), cs({ b: 'major' }, 'b.md')], true)).toBe('major')
  })

  test('global highest fixed=false: same global behavior', () => {
    expect(inferBump([cs({ a: 'patch' }), cs({ b: 'minor' }, 'b.md')], false)).toBe('minor')
    expect(inferBump([cs({ a: 'minor' }), cs({ b: 'major' }, 'b.md')], false)).toBe('major')
  })

  test('within a single file with mixed bumps → highest', () => {
    expect(inferBump([cs({ a: 'minor', b: 'major' })], true)).toBe('major')
    expect(inferBump([cs({ a: 'minor', b: 'major' })], false)).toBe('major')
  })
})

describe('parseTagVersion', () => {
  test('v0.2.3 → 0.2.3', () => {
    expect(parseTagVersion('v0.2.3')).toBe('0.2.3')
  })

  test('0.2.3 → 0.2.3', () => {
    expect(parseTagVersion('0.2.3')).toBe('0.2.3')
  })

  test('v1.0.0-rc.1 → 1.0.0-rc.1', () => {
    expect(parseTagVersion('v1.0.0-rc.1')).toBe('1.0.0-rc.1')
  })

  test('throws on invalid tag', () => {
    expect(() => parseTagVersion('release-foo')).toThrow(/invalid tag/i)
    expect(() => parseTagVersion('')).toThrow(/invalid tag/i)
  })
})
