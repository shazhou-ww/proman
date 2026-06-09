import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('proman init integration', () => {
  let testDir: string
  let projectDir: string

  beforeAll(() => {
    // Create a unique temp directory for integration test
    testDir = join(
      tmpdir(),
      `proman-init-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
    projectDir = join(testDir, 'test-project')

    // Get the path to the proman CLI
    const promanBin = join(process.cwd(), 'dist', 'cli.js')

    // Run proman init
    execSync(`node ${promanBin} init test-project`, { cwd: testDir })

    // Install dependencies
    execSync('pnpm install', { cwd: projectDir, stdio: 'inherit' })
  }, 60000)

  afterAll(() => {
    // Clean up the test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('proman build succeeds', () => {
    const promanBin = join(process.cwd(), 'dist', 'cli.js')
    expect(() => {
      execSync(`node ${promanBin} build`, { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })

  test('proman test succeeds', () => {
    const promanBin = join(process.cwd(), 'dist', 'cli.js')
    expect(() => {
      execSync(`node ${promanBin} test`, { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })

  test('proman check succeeds', () => {
    const promanBin = join(process.cwd(), 'dist', 'cli.js')
    expect(() => {
      execSync(`node ${promanBin} check`, { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })
})
