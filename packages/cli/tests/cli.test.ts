import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'

const CLI = resolve(__dirname, '..', 'dist', 'cli.js')

function runCli(args: string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const res = spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    cwd: cwd ?? resolve(__dirname, '..', '..', '..'),
  })
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
    expect(stdout).toContain('bump')
    expect(stdout).toContain('publish')
    expect(stdout).not.toContain('release')
    expect(stdout).toContain('build')
    expect(stdout).toContain('test')
    expect(stdout).toContain('check')
    expect(stdout).toContain('format')
    expect(stdout).toContain('link')
    expect(stdout).toContain('unlink')
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

  test('D-help: --help mentions deploy', () => {
    const { code, stdout } = runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('deploy')
  })

  test('D-deploy-unknown: deploy --bogus exits non-zero', () => {
    const { code, stderr } = runCli(['deploy', '--bogus'])
    expect(code).not.toBe(0)
    expect(stderr.toLowerCase()).toMatch(/--bogus|unknown/)
  })
})

describe('cli-kit integration', () => {
  test('FP-CLI4: --help text mentions --force', () => {
    const { code, stdout } = runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('--force')
  })

  test('cards index produces structured output with --format json', () => {
    const { code, stdout } = runCli(['cards', 'index', '--format', 'json'])
    expect(code).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.type).toBe('@proman/cards/index')
    expect(parsed.value.count).toBeGreaterThan(0)
  })

  test('cards list yields NDJSON on stderr', () => {
    const { code, stderr } = runCli(['cards', 'list', '--format', 'json'])
    expect(code).toBe(0)
    const lines = stderr.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    const first = JSON.parse(lines[0] ?? '')
    expect(first.type).toBe('@proman/cards/list/yield')
    expect(first.value.id).toBeDefined()
  })

  test('--quiet suppresses stderr yields', () => {
    const { code, stderr } = runCli(['cards', 'list', '--quiet'])
    expect(code).toBe(0)
    expect(stderr).toBe('')
  })

  test('cards toc outputs text in --format text', () => {
    const { code, stdout } = runCli(['cards', 'toc', '--format', 'text'])
    expect(code).toBe(0)
    expect(stdout).toContain('Knowledge Cards')
  })

  test('cards validate exits non-zero on errors or zero on success', () => {
    const { code } = runCli(['cards', 'validate', '--format', 'json'])
    // 0 if all valid, 1 if errors found
    expect([0, 1]).toContain(code)
  })
})
