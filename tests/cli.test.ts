import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const CLI = resolve(import.meta.dir, '..', 'src', 'cli.ts')

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync('bun', [CLI, ...args], { encoding: 'utf8' })
  return {
    code: res.status ?? 0,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  }
}

describe('cli help', () => {
  test('D5: --help prints usage with all commands', () => {
    const { code, stdout } = runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: proman')
    expect(stdout).toContain('release prepare')
    expect(stdout).toContain('release candidate')
    expect(stdout).toContain('release finalize')
    expect(stdout).toContain('build')
    expect(stdout).toContain('test')
    expect(stdout).toContain('check')
    expect(stdout).toContain('format')
  })

  test('D6: no args prints help', () => {
    const { code, stdout } = runCli([])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: proman')
    expect(stdout).toContain('build')
  })

  test('D7: -h is treated like --help', () => {
    const { code, stdout } = runCli(['-h'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: proman')
  })

  test('D8: --version prints version', () => {
    const { code, stdout } = runCli(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim().length).toBeGreaterThan(0)
    expect(stdout).not.toContain('Usage:')
  })

  test('D8: -v prints version', () => {
    const { code, stdout } = runCli(['-v'])
    expect(code).toBe(0)
    expect(stdout.trim().length).toBeGreaterThan(0)
  })

  test('D9: unknown command exits non-zero', () => {
    const { code, stderr } = runCli(['nope'])
    expect(code).not.toBe(0)
    expect(stderr).toContain('nope')
  })

  test('E3: help written to stdout, exit 0', () => {
    const { code, stdout, stderr } = runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)
    expect(stderr).toBe('')
  })
})
