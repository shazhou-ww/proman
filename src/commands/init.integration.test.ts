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

    // Get the path to the proman CLI (used only for init — the generated project uses its own)
    const promanBin = join(process.cwd(), 'dist', 'cli.js')

    // Run proman init
    execSync(`node ${promanBin} init test-project`, { cwd: testDir })

    // Install dependencies — this installs @shazhou/proman as a devDep inside the generated project.
    // 60s timeout: pnpm install can be slow on first run (cold cache, registry fetch).
    execSync('pnpm install', { cwd: projectDir, stdio: 'inherit' })
  }, 60_000)

  afterAll(() => {
    // Clean up the test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('proman build succeeds', () => {
    // Use the generated project's own proman (installed as devDep), not the parent's
    expect(() => {
      execSync('pnpm exec proman build', { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })

  test('proman test succeeds', () => {
    expect(() => {
      execSync('pnpm exec proman test', { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })

  test('proman check succeeds', () => {
    expect(() => {
      execSync('pnpm exec proman check', { cwd: projectDir, stdio: 'inherit' })
    }).not.toThrow()
  })
})
