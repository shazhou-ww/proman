import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { build, check, format, runTests } from '../src/commands/dev.ts'

import type { SpawnFn } from '../src/utils/npm.ts'

const FIX = (name: string) => resolve(__dirname, 'fixtures', name)

type Call = { argv: string[]; cwd: string }

function makeSpawn(code = 0, stdout = '', stderr = '') {
  const calls: Call[] = []
  const fn: SpawnFn = async (argv, cwd) => {
    calls.push({ argv, cwd })
    return { code, stdout, stderr }
  }
  return { spawn: fn, calls }
}

/** Check that argv contains `pm exec bin` pattern */
function expectExec(argv: string[], bin: string, args: string[]) {
  const binIdx = argv.indexOf(bin)
  expect(binIdx).toBeGreaterThanOrEqual(0)
  for (let i = 0; i < args.length; i++) {
    expect(argv[binIdx + 1 + i]).toBe(args[i])
  }
}

describe('build command', () => {
  test('C1: dispatches tsc --build per package in order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(3) // core, fs, cli
    for (const c of calls) {
      expect(c.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
      expectExec(c.argv, 'tsc', ['--build'])
    }
    expect(calls[0]?.cwd).toBe(resolve(FIX('valid'), 'packages/core'))
    expect(calls[1]?.cwd).toBe(resolve(FIX('valid'), 'packages/fs'))
    expect(calls[2]?.cwd).toBe(resolve(FIX('valid'), 'packages/cli'))
  })

  test('C1b: node-runtime uses pnpm exec tsc --build', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
  })

  test('C1c: pnpm project uses pnpm exec tsc --build', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'tsc', '--build'])
  })

  test('C1d: typed fixture dispatches by type in declared order', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('typed'), spawn })
    expect(calls).toHaveLength(4)
    // lib: tsc --build
    expectExec(calls[0]?.argv, 'tsc', ['--build'])
    expect(calls[0]?.cwd).toBe(resolve(FIX('typed'), 'packages/core'))
    // cli: pnpm run build (has build script in package.json)
    expect(calls[1]?.argv).toEqual(['pnpm', 'run', 'build'])
    expect(calls[1]?.cwd).toBe(resolve(FIX('typed'), 'packages/mycli'))
    // webui: vite build
    expectExec(calls[2]?.argv, 'vite', ['build'])
    expect(calls[2]?.cwd).toBe(resolve(FIX('typed'), 'packages/dashboard'))
    // api: tsc --build
    expectExec(calls[3]?.argv, 'tsc', ['--build'])
    expect(calls[3]?.cwd).toBe(resolve(FIX('typed'), 'packages/api'))
  })

  test('C-bin: webui uses pnpm exec vite', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('webui-only'), spawn })
    expect(calls).toHaveLength(1)
    expectExec(calls[0]?.argv, 'vite', ['build'])
  })

  test('C-pnpm: uses pnpm exec', async () => {
    const { spawn, calls } = makeSpawn()
    await build({ cwd: FIX('valid'), spawn })
    expect(calls[0]?.argv[0]).toBe('pnpm')
    expect(calls[0]?.argv[1]).toBe('exec')
  })

  test('C6: build throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'build error')
    await expect(build({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('test command', () => {
  test('C2: invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    const { argv, cwd } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
    expect(cwd).toBe(FIX('valid'))
  })

  test('C3: node-runtime invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    const { argv } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
  })

  test('C3b: pnpm project invokes pnpm exec vitest run', async () => {
    const { spawn, calls } = makeSpawn()
    await runTests({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    const { argv } = calls[0] as Call
    expect(argv).toEqual(['pnpm', 'exec', 'vitest', 'run'])
  })

  test('C6: test throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(runTests({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('check command', () => {
  test('C4: invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C4b: valid fixture invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('valid'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C4c: pnpm project invokes pnpm exec biome check .', async () => {
    const { spawn, calls } = makeSpawn()
    await check({ cwd: FIX('pnpm-project'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'check', '.'])
  })

  test('C6: check throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(check({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

describe('check — workflow validation', () => {
  let tmpDir: string

  function writeCheckFixture(opts: {
    workflows?: Record<string, string>
    uwfInstalled?: boolean
    uwfExitCode?: number
    uwfStderr?: string
  }): { cwd: string; spawn: SpawnFn; calls: Call[] } {
    tmpDir = resolve(
      tmpdir(),
      `proman-wf-check-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })

    // minimal proman.yaml
    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/core"\n    path: packages/core\n    type: lib\n',
    )
    mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'packages/core/package.json'), '{}')

    // .workflows/ files
    if (opts.workflows) {
      mkdirSync(join(tmpDir, '.workflows'), { recursive: true })
      for (const [name, content] of Object.entries(opts.workflows)) {
        writeFileSync(join(tmpDir, '.workflows', name), content)
      }
    }

    const calls: Call[] = []
    const uwfInstalled = opts.uwfInstalled ?? true
    const uwfExitCode = opts.uwfExitCode ?? 0
    const uwfStderr = opts.uwfStderr ?? ''

    const spawn: SpawnFn = async (argv, cwd) => {
      calls.push({ argv, cwd })
      // biome check always passes
      if (argv.includes('biome')) return { code: 0, stdout: '', stderr: '' }
      // which uwf
      if (argv[0] === 'which' && argv[1] === 'uwf') {
        return { code: uwfInstalled ? 0 : 1, stdout: '', stderr: '' }
      }
      // uwf workflow validate
      if (argv[0] === 'uwf' && argv[1] === 'workflow' && argv[2] === 'validate') {
        return { code: uwfExitCode, stdout: uwfExitCode === 0 ? '✓ valid' : '', stderr: uwfStderr }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    return { cwd: tmpDir, spawn, calls }
  }

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('WF1: validates workflow files with uwf workflow validate', async () => {
    const { cwd, spawn, calls } = writeCheckFixture({
      workflows: { 'solve-issue.yaml': 'version: 1\nname: solve-issue\n' },
    })
    await check({ cwd, spawn })

    const uwfCalls = calls.filter((c) => c.argv[0] === 'uwf')
    expect(uwfCalls).toHaveLength(1)
    expect(uwfCalls[0]?.argv[2]).toBe('validate')
    expect(uwfCalls[0]?.argv[3]).toContain('solve-issue.yaml')
  })

  test('WF2: validates multiple workflow files', async () => {
    const { cwd, spawn, calls } = writeCheckFixture({
      workflows: {
        'solve-issue.yaml': 'version: 1\nname: solve-issue\n',
        'review-pr.yaml': 'version: 1\nname: review-pr\n',
      },
    })
    await check({ cwd, spawn })

    const uwfCalls = calls.filter((c) => c.argv[0] === 'uwf')
    expect(uwfCalls).toHaveLength(2)
  })

  test('WF3: skips with warning when uwf is not installed', async () => {
    const { cwd, spawn, calls } = writeCheckFixture({
      workflows: { 'solve-issue.yaml': 'version: 1\nname: solve-issue\n' },
      uwfInstalled: false,
    })
    await check({ cwd, spawn })

    const uwfValidateCalls = calls.filter((c) => c.argv[0] === 'uwf' && c.argv[1] === 'workflow')
    expect(uwfValidateCalls).toHaveLength(0)
  })

  test('WF4: throws when validation fails', async () => {
    const { cwd, spawn } = writeCheckFixture({
      workflows: { 'bad.yaml': 'invalid' },
      uwfExitCode: 1,
      uwfStderr: 'missing required field: name',
    })
    await expect(check({ cwd, spawn })).rejects.toThrow('Workflow validation failed')
  })

  test('WF5: no .workflows directory — skips silently', async () => {
    const { cwd, spawn, calls } = writeCheckFixture({})
    await check({ cwd, spawn })

    const uwfCalls = calls.filter((c) => c.argv[0] === 'uwf' || c.argv[0] === 'which')
    expect(uwfCalls).toHaveLength(0)
  })

  test('WF6: ignores non-yaml files in .workflows/', async () => {
    const { cwd, spawn, calls } = writeCheckFixture({
      workflows: { 'README.md': '# workflows' },
    })
    await check({ cwd, spawn })

    const uwfCalls = calls.filter((c) => c.argv[0] === 'uwf' || c.argv[0] === 'which')
    expect(uwfCalls).toHaveLength(0)
  })
})

describe('format command', () => {
  test('C5: invokes pnpm exec biome format --write .', async () => {
    const { spawn, calls } = makeSpawn()
    await format({ cwd: FIX('node-runtime'), spawn })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['pnpm', 'exec', 'biome', 'format', '--write', '.'])
  })

  test('C6: format throws on non-zero exit', async () => {
    const { spawn } = makeSpawn(1, '', 'fail')
    await expect(format({ cwd: FIX('valid'), spawn })).rejects.toThrow()
  })
})

// ── chmod +x bin entries after build ────────────────────────────────────────

describe('build — chmod +x bin entries', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `proman-chmod-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTmpProject(bins: Record<string, string> | string | undefined): {
    cwd: string
    spawn: SpawnFn
  } {
    const pkgDir = join(tmpDir, 'packages', 'mycli')
    const distDir = join(pkgDir, 'dist')
    mkdirSync(distDir, { recursive: true })

    // proman.yaml
    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/cli"\n    path: packages/mycli\n    type: cli\n',
    )

    // package.json with bin
    const pkgJson: Record<string, unknown> = { name: '@test/cli', version: '1.0.0' }
    if (bins !== undefined) pkgJson.bin = bins
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkgJson))

    // Mock spawn that recreates dist/cli.js with 644 (simulates tsc output)
    const spawn: SpawnFn = async (_argv, cwd) => {
      const out = join(cwd, 'dist')
      mkdirSync(out, { recursive: true })
      writeFileSync(join(out, 'cli.js'), '#!/usr/bin/env node\n')
      chmodSync(join(out, 'cli.js'), 0o644)
      return { code: 0, stdout: '', stderr: '' }
    }

    return { cwd: tmpDir, spawn }
  }

  test('B1: bin object — chmod +x applied after build', async () => {
    const { cwd, spawn } = writeTmpProject({ mycli: './dist/cli.js' })
    await build({ cwd, spawn })

    const mode = statSync(join(cwd, 'packages/mycli/dist/cli.js')).mode & 0o777
    expect(mode).toBe(0o755)
  })

  test('B2: bin string — chmod +x applied after build', async () => {
    const { cwd, spawn } = writeTmpProject('./dist/cli.js')
    await build({ cwd, spawn })

    const mode = statSync(join(cwd, 'packages/mycli/dist/cli.js')).mode & 0o777
    expect(mode).toBe(0o755)
  })

  test('B3: no bin field — no crash', async () => {
    const { cwd, spawn } = writeTmpProject(undefined)
    await build({ cwd, spawn })
    // Should not throw
  })

  test('B4: bin points to missing file — no crash', async () => {
    const { cwd, spawn } = writeTmpProject({ mycli: './dist/nonexistent.js' })
    await build({ cwd, spawn })
    // Should not throw
  })
})

// ── fingerprint skip ────────────────────────────────────────────────────────

describe('build — fingerprint skip', () => {
  let tmpDir: string

  function writeMonorepoFixture(): string {
    tmpDir = resolve(
      tmpdir(),
      `proman-fp-build-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })

    // proman.yaml
    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      [
        'packages:',
        '  - name: "@test/core"',
        '    path: packages/core',
        '    type: lib',
        '  - name: "@test/fs"',
        '    path: packages/fs',
        '    type: lib',
        '  - name: "@test/cli"',
        '    path: packages/cli',
        '    type: cli',
      ].join('\n'),
    )

    // core (no deps)
    mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(
      join(tmpDir, 'packages/core/package.json'),
      JSON.stringify({ name: '@test/core', version: '1.0.0' }),
    )
    writeFileSync(join(tmpDir, 'packages/core/tsconfig.json'), '{}')

    // fs (depends on core)
    mkdirSync(join(tmpDir, 'packages/fs/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/fs/src/index.ts'), 'export const y = 2')
    writeFileSync(
      join(tmpDir, 'packages/fs/package.json'),
      JSON.stringify({
        name: '@test/fs',
        version: '1.0.0',
        dependencies: { '@test/core': 'workspace:*' },
      }),
    )
    writeFileSync(join(tmpDir, 'packages/fs/tsconfig.json'), '{}')

    // cli (depends on fs)
    mkdirSync(join(tmpDir, 'packages/cli/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/cli/src/index.ts'), 'export const z = 3')
    writeFileSync(
      join(tmpDir, 'packages/cli/package.json'),
      JSON.stringify({
        name: '@test/cli',
        version: '1.0.0',
        dependencies: { '@test/fs': 'workspace:*' },
      }),
    )
    writeFileSync(join(tmpDir, 'packages/cli/tsconfig.json'), '{}')

    return tmpDir
  }

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('FP-B1: first run — no stored fingerprint → runs build, writes fingerprint', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn, calls } = makeSpawn()

    await build({ cwd, spawn, force: false })

    // build ran for all 3 packages
    expect(calls.length).toBe(3)
    // fingerprint files written inside each package's dist folder
    expect(existsSync(join(cwd, 'packages/core/dist/.build-fingerprint'))).toBe(true)
    expect(existsSync(join(cwd, 'packages/fs/dist/.build-fingerprint'))).toBe(true)
    expect(existsSync(join(cwd, 'packages/cli/dist/.build-fingerprint'))).toBe(true)
  })

  test('FP-B2: second run — fingerprint matches → skips build', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn, calls } = makeSpawn()

    await build({ cwd, spawn, force: false })
    expect(calls.length).toBe(3)

    // Second run — should skip all
    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await build({ cwd, spawn: spawn2, force: false })
    expect(calls2.length).toBe(0)
  })

  test('FP-B3: file changed — fingerprint mismatches → runs build', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn } = makeSpawn()
    await build({ cwd, spawn, force: false })

    // Modify core's source
    writeFileSync(join(cwd, 'packages/core/src/index.ts'), 'export const x = 999')

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await build({ cwd, spawn: spawn2, force: false })
    // All 3 should re-run (core changed, fs/cli depend on core)
    expect(calls2.length).toBe(3)
  })

  test('FP-B4: force=true — runs even when fingerprint matches', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn } = makeSpawn()
    await build({ cwd, spawn, force: false })

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await build({ cwd, spawn: spawn2, force: true })
    expect(calls2.length).toBe(3)
  })

  test('FP-B5: build failure — does NOT write fingerprint', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn } = makeSpawn(1, '', 'build error')

    await expect(build({ cwd, spawn, force: false })).rejects.toThrow()

    // No fingerprint files should exist
    expect(existsSync(join(cwd, '.proman/build/@test-core.fingerprint'))).toBe(false)
  })

  test('FP-B6: dependency propagation — core change re-runs fs and cli', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn } = makeSpawn()
    await build({ cwd, spawn, force: false })

    // Modify only core
    writeFileSync(join(cwd, 'packages/core/src/index.ts'), 'export const x = 777')

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await build({ cwd, spawn: spawn2, force: false })

    // All 3 re-run because core → fs → cli dependency chain
    expect(calls2.length).toBe(3)
    expect(calls2[0]?.cwd).toBe(resolve(cwd, 'packages/core'))
    expect(calls2[1]?.cwd).toBe(resolve(cwd, 'packages/fs'))
    expect(calls2[2]?.cwd).toBe(resolve(cwd, 'packages/cli'))
  })

  test('FP-B7: CI env — runs build even when fingerprint matches', async () => {
    const cwd = writeMonorepoFixture()
    const { spawn } = makeSpawn()
    await build({ cwd, spawn, force: false })

    // Simulate CI behavior: cli.ts passes force=true when CI=true
    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await build({ cwd, spawn: spawn2, force: true })
    expect(calls2.length).toBe(3)
  })

  test('FP-B8: partial skip — only stale packages rebuild', async () => {
    // Monorepo with 2 independent packages (no cross-deps)
    const dir = resolve(
      tmpdir(),
      `proman-fp-partial-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(dir, { recursive: true })
    tmpDir = dir

    writeFileSync(
      join(dir, 'proman.yaml'),
      [
        'packages:',
        '  - name: "@test/alpha"',
        '    path: packages/alpha',
        '    type: lib',
        '  - name: "@test/beta"',
        '    path: packages/beta',
        '    type: lib',
      ].join('\n'),
    )

    // alpha (no deps)
    mkdirSync(join(dir, 'packages/alpha/src'), { recursive: true })
    writeFileSync(join(dir, 'packages/alpha/src/index.ts'), 'export const a = 1')
    writeFileSync(
      join(dir, 'packages/alpha/package.json'),
      JSON.stringify({ name: '@test/alpha', version: '1.0.0' }),
    )
    writeFileSync(join(dir, 'packages/alpha/tsconfig.json'), '{}')

    // beta (no deps)
    mkdirSync(join(dir, 'packages/beta/src'), { recursive: true })
    writeFileSync(join(dir, 'packages/beta/src/index.ts'), 'export const b = 1')
    writeFileSync(
      join(dir, 'packages/beta/package.json'),
      JSON.stringify({ name: '@test/beta', version: '1.0.0' }),
    )
    writeFileSync(join(dir, 'packages/beta/tsconfig.json'), '{}')

    // First run — both build
    const { spawn: s1, calls: c1 } = makeSpawn()
    await build({ cwd: dir, spawn: s1, force: false })
    expect(c1.length).toBe(2)

    // Modify only beta
    writeFileSync(join(dir, 'packages/beta/src/index.ts'), 'export const b = 999')

    // Second run — only beta should rebuild
    const { spawn: s2, calls: c2 } = makeSpawn()
    await build({ cwd: dir, spawn: s2, force: false })
    expect(c2.length).toBe(1)
    expect(c2[0]?.cwd).toBe(resolve(dir, 'packages/beta'))
  })
})

describe('test — fingerprint skip', () => {
  let tmpDir: string

  function writeRootFixture(): string {
    tmpDir = resolve(
      tmpdir(),
      `proman-fp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })

    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/core"\n    path: packages/core\n    type: lib\n',
    )
    mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'packages/core/package.json'), '{}')
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    mkdirSync(join(tmpDir, 'tests'), { recursive: true })
    writeFileSync(join(tmpDir, 'src/a.ts'), 'export const a = 1')
    writeFileSync(join(tmpDir, 'tests/a.test.ts'), 'test("a", () => {})')
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    return tmpDir
  }

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('FP-T1: first run → runs test, writes fingerprint', async () => {
    const cwd = writeRootFixture()
    const { spawn, calls } = makeSpawn()

    await runTests({ cwd, spawn, force: false })

    expect(calls.length).toBe(1)
    expect(existsSync(join(cwd, '.proman/test/root.fingerprint'))).toBe(true)
  })

  test('FP-T2: no changes → skips test', async () => {
    const cwd = writeRootFixture()
    const { spawn } = makeSpawn()
    await runTests({ cwd, spawn, force: false })

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await runTests({ cwd, spawn: spawn2, force: false })
    expect(calls2.length).toBe(0)
  })

  test('FP-T3: force=true → runs test even if cached', async () => {
    const cwd = writeRootFixture()
    const { spawn } = makeSpawn()
    await runTests({ cwd, spawn, force: false })

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await runTests({ cwd, spawn: spawn2, force: true })
    expect(calls2.length).toBe(1)
  })

  test('FP-T4: test failure → fingerprint NOT written', async () => {
    const cwd = writeRootFixture()
    const { spawn } = makeSpawn(1, '', 'test failure')

    await expect(runTests({ cwd, spawn, force: false })).rejects.toThrow()
    expect(existsSync(join(cwd, '.proman/test/root.fingerprint'))).toBe(false)
  })
})

describe('check — fingerprint skip', () => {
  let tmpDir: string

  function writeCheckFixture(): string {
    tmpDir = resolve(
      tmpdir(),
      `proman-fp-check-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(tmpDir, { recursive: true })

    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/core"\n    path: packages/core\n    type: lib\n',
    )
    mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'packages/core/package.json'), '{}')
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(join(tmpDir, 'src/a.ts'), 'export const a = 1')
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    writeFileSync(join(tmpDir, 'biome.json'), '{}')
    return tmpDir
  }

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('FP-C1: first run → runs check, writes fingerprint', async () => {
    const cwd = writeCheckFixture()
    const { spawn, calls } = makeSpawn()

    await check({ cwd, spawn, force: false })

    expect(calls.length).toBe(1)
    expect(existsSync(join(cwd, '.proman/check/root.fingerprint'))).toBe(true)
  })

  test('FP-C2: no changes → skips check', async () => {
    const cwd = writeCheckFixture()
    const { spawn } = makeSpawn()
    await check({ cwd, spawn, force: false })

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await check({ cwd, spawn: spawn2, force: false })
    expect(calls2.length).toBe(0)
  })

  test('FP-C3: force=true → runs check even if cached', async () => {
    const cwd = writeCheckFixture()
    const { spawn } = makeSpawn()
    await check({ cwd, spawn, force: false })

    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await check({ cwd, spawn: spawn2, force: true })
    expect(calls2.length).toBe(1)
  })

  test('FP-C4: check failure → fingerprint NOT written', async () => {
    const cwd = writeCheckFixture()
    const { spawn } = makeSpawn(1, '', 'check failure')

    await expect(check({ cwd, spawn, force: false })).rejects.toThrow()
    expect(existsSync(join(cwd, '.proman/check/root.fingerprint'))).toBe(false)
  })
})

describe('format — no fingerprint', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  test('FP-F1: format always runs, no fingerprint directory created', async () => {
    tmpDir = resolve(tmpdir(), `proman-fp-fmt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })

    writeFileSync(
      join(tmpDir, 'proman.yaml'),
      'packages:\n  - name: "@test/core"\n    path: packages/core\n    type: lib\n',
    )
    mkdirSync(join(tmpDir, 'packages/core/src'), { recursive: true })
    writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), 'export const x = 1')
    writeFileSync(join(tmpDir, 'packages/core/package.json'), '{}')
    writeFileSync(join(tmpDir, 'package.json'), '{}')

    const { spawn, calls } = makeSpawn()
    await format({ cwd: tmpDir, spawn })
    expect(calls.length).toBe(1)

    // format has no fingerprint logic — no .proman/format/ directory
    expect(existsSync(join(tmpDir, '.proman/format'))).toBe(false)

    // Second run also always runs
    const { spawn: spawn2, calls: calls2 } = makeSpawn()
    await format({ cwd: tmpDir, spawn: spawn2 })
    expect(calls2.length).toBe(1)
  })
})
