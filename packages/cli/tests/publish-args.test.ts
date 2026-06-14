import { describe, expect, test } from 'vitest'
import { parsePublishArgs } from '../src/cli.ts'

describe('parsePublishArgs', () => {
  test('no args', () => {
    const r = parsePublishArgs([])
    expect(r.skipTests).toBe(false)
    expect(r.skipSmoke).toBe(false)
  })

  test('--skip-tests', () => {
    const r = parsePublishArgs(['--skip-tests'])
    expect(r.skipTests).toBe(true)
    expect(r.skipSmoke).toBe(false)
  })

  test('--skip-smoke', () => {
    const r = parsePublishArgs(['--skip-smoke'])
    expect(r.skipSmoke).toBe(true)
    expect(r.skipTests).toBe(false)
  })

  test('--skip-tests and --skip-smoke combined', () => {
    const r = parsePublishArgs(['--skip-tests', '--skip-smoke'])
    expect(r.skipTests).toBe(true)
    expect(r.skipSmoke).toBe(true)
  })

  test('rejects unknown flag', () => {
    expect(() => parsePublishArgs(['--foo'])).toThrow('unknown flag')
  })
})
