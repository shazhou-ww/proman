import { describe, expect, test } from 'vitest'
import { parsePublishArgs } from '../src/cli.ts'

describe('parsePublishArgs', () => {
  test('no args', () => {
    const r = parsePublishArgs([])
    expect(r.skipTests).toBe(false)
  })

  test('--skip-tests', () => {
    const r = parsePublishArgs(['--skip-tests'])
    expect(r.skipTests).toBe(true)
  })

  test('rejects unknown flag', () => {
    expect(() => parsePublishArgs(['--foo'])).toThrow('unknown flag')
  })
})
