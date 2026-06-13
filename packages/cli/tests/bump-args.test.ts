import { describe, expect, test } from 'vitest'
import { parseBumpArgs } from '../src/cli.ts'

describe('parseBumpArgs', () => {
  test('no args', () => {
    const r = parseBumpArgs([])
    expect(r.type).toBeUndefined()
  })

  test('--type patch', () => {
    const r = parseBumpArgs(['--type', 'patch'])
    expect(r.type).toBe('patch')
  })

  test('--type minor', () => {
    const r = parseBumpArgs(['--type', 'minor'])
    expect(r.type).toBe('minor')
  })

  test('--type major', () => {
    const r = parseBumpArgs(['--type', 'major'])
    expect(r.type).toBe('major')
  })

  test('rejects invalid --type', () => {
    expect(() => parseBumpArgs(['--type', 'huge'])).toThrow('must be major, minor, or patch')
  })

  test('rejects unknown flag', () => {
    expect(() => parseBumpArgs(['--foo'])).toThrow('unknown flag')
  })
})
