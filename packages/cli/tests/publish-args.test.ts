import { describe, expect, test } from 'vitest'

// Arg parsing is now handled internally by @ocas/cli-kit.
// See cli.test.ts for integration tests via spawnSync.

describe('cli-kit migration', () => {
  test('placeholder — arg parsing delegated to cli-kit', () => {
    expect(true).toBe(true)
  })
})
