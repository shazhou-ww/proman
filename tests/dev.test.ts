import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { build, check, format, runTests } from '../src/commands/dev.ts'
import { readFingerprint, sanitizePkgName } from '../src/utils/fingerprint.ts'
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
    // cli: tsc --build
    expectExec(calls[1]?.argv, 'tsc', ['--build'])
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

// ── fingerprint skip ────────────────────────────────────────────────────

describe('fingerprint skip', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `proman-fp-dev-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  /**
   * Create a minimal monorepo fixture with proman.yaml, package dirs, src files.
   * core → fs → cli dependency chain.
   */
  function writeFpFixture(): void {
    const packages = [
      { name: '@test/core', path: 'packages/core', deps: {} },
      { name: '@test/fs', path: 'packages/fs', deps: { '@test/core': 'workspace:*' } },
      { name: '@test/cli', path: 'packages/cli', deps: { '@test/fs': 'workspace:*' } },
    ]

    // proman.yaml
    const yamlLines = ['packages:']
    for (const pkg of packages) {
      yamlLines.push(`  - name: "${pkg.name}"`)
      yamlLines.push(`    path: ${pkg.path}`)
      yamlLines.push('    type: lib')
    }
    writeFileSync(join(tmpDir, 'proman.yaml'), yamlLines.join('\n'))

    // package dirs with src
    for (const pkg of packages) {
      const pkgDir = join(tmpDir, pkg.path)
      const srcDir = join(pkgDir, 'src')
      mkdirSync(srcDir, { recursive: true })
      writeFileSync(join(srcDir, 'index.ts'), `// ${pkg.name}\nexport const x = 1`)
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: pkg.name,
          version: '1.0.0',
          ...(Object.keys(pkg.deps).length > 0 ? { dependencies: pkg.deps } : {}),
        }),
      )
    }

    // Root files for test/check
    writeFileSync(join(tmpDir, 'package.json'), '{}')
    mkdirSync(join(tmpDir, 'tests'), { recursive: true })
    writeFileSync(join(tmpDir, 'tests', 'example.test.ts'), 'test("x", () => {})')
  }

  // ── build — fingerprint skip ──────────────────────────────────

  describe('build — fingerprint skip', () => {
    test('FP-B1: first run — no stored fingerprint → runs build, writes fingerprint', async () => {
      writeFpFixture()
      const { spawn, calls } = makeSpawn()
      await build({ cwd: tmpDir, spawn, force: false })

      // build ran for all 3 packages
      expect(calls.length).toBe(3)

      // fingerprint files written
      const fpDir = join(tmpDir, '.proman', 'build')
      for (const name of ['@test/core', '@test/fs', '@test/cli']) {
        const fpFile = join(fpDir, `${sanitizePkgName(name)}.fingerprint`)
        expect(readFingerprint(fpFile)).not.toBeNull()
      }
    })

    test('FP-B2: second run — fingerprint matches → skips build', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s1.spawn, force: false })
      expect(s1.calls.length).toBe(3) // first run builds all

      const s2 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s2.spawn, force: false })
      expect(s2.calls.length).toBe(0) // second run skips all
    })

    test('FP-B3: file changed — fingerprint mismatches → runs build', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s1.spawn, force: false })

      // modify core source
      writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), '// changed')

      const s2 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s2.spawn, force: false })
      // core + dependents (fs, cli) should re-build
      expect(s2.calls.length).toBeGreaterThan(0)
    })

    test('FP-B4: force=true — runs even when fingerprint matches', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s1.spawn, force: false })

      const s2 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s2.spawn, force: true })
      expect(s2.calls.length).toBe(3)
    })

    test('FP-B5: build failure — does NOT write/update fingerprint', async () => {
      writeFpFixture()
      const { spawn } = makeSpawn(1, '', 'build error')
      await expect(build({ cwd: tmpDir, spawn, force: false })).rejects.toThrow()

      // No fingerprint files should exist
      const fpDir = join(tmpDir, '.proman', 'build')
      expect(existsSync(fpDir)).toBe(false)
    })

    test('FP-B6: dependency propagation — core change re-runs fs and cli', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s1.spawn, force: false })

      // Modify only core
      writeFileSync(join(tmpDir, 'packages/core/src/index.ts'), '// core v2')

      const s2 = makeSpawn()
      await build({ cwd: tmpDir, spawn: s2.spawn, force: false })

      // All three should re-build due to dep propagation
      const rebuiltDirs = s2.calls.map((c) => c.cwd)
      expect(rebuiltDirs).toContain(resolve(tmpDir, 'packages/core'))
      expect(rebuiltDirs).toContain(resolve(tmpDir, 'packages/fs'))
      expect(rebuiltDirs).toContain(resolve(tmpDir, 'packages/cli'))
    })
  })

  // ── test — fingerprint skip ──────────────────────────────────

  describe('test — fingerprint skip', () => {
    test('FP-T1: first run → runs test, writes fingerprint', async () => {
      writeFpFixture()
      const { spawn, calls } = makeSpawn()
      await runTests({ cwd: tmpDir, spawn, force: false })

      expect(calls.length).toBe(1)
      const fpFile = join(tmpDir, '.proman', 'test', 'root.fingerprint')
      expect(readFingerprint(fpFile)).not.toBeNull()
    })

    test('FP-T2: no changes → skips test', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await runTests({ cwd: tmpDir, spawn: s1.spawn, force: false })
      expect(s1.calls.length).toBe(1)

      const s2 = makeSpawn()
      await runTests({ cwd: tmpDir, spawn: s2.spawn, force: false })
      expect(s2.calls.length).toBe(0)
    })

    test('FP-T3: force=true → runs test even if cached', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await runTests({ cwd: tmpDir, spawn: s1.spawn, force: false })

      const s2 = makeSpawn()
      await runTests({ cwd: tmpDir, spawn: s2.spawn, force: true })
      expect(s2.calls.length).toBe(1)
    })

    test('FP-T4: test failure → fingerprint NOT written', async () => {
      writeFpFixture()
      const { spawn } = makeSpawn(1, '', 'test fail')
      await expect(runTests({ cwd: tmpDir, spawn, force: false })).rejects.toThrow()

      const fpFile = join(tmpDir, '.proman', 'test', 'root.fingerprint')
      expect(readFingerprint(fpFile)).toBeNull()
    })
  })

  // ── check — fingerprint skip ─────────────────────────────────

  describe('check — fingerprint skip', () => {
    test('FP-C1: first run → runs check, writes fingerprint', async () => {
      writeFpFixture()
      const { spawn, calls } = makeSpawn()
      await check({ cwd: tmpDir, spawn, force: false })

      expect(calls.length).toBe(1)
      const fpFile = join(tmpDir, '.proman', 'check', 'root.fingerprint')
      expect(readFingerprint(fpFile)).not.toBeNull()
    })

    test('FP-C2: no changes → skips check', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await check({ cwd: tmpDir, spawn: s1.spawn, force: false })
      expect(s1.calls.length).toBe(1)

      const s2 = makeSpawn()
      await check({ cwd: tmpDir, spawn: s2.spawn, force: false })
      expect(s2.calls.length).toBe(0)
    })

    test('FP-C3: force=true → runs check even if cached', async () => {
      writeFpFixture()
      const s1 = makeSpawn()
      await check({ cwd: tmpDir, spawn: s1.spawn, force: false })

      const s2 = makeSpawn()
      await check({ cwd: tmpDir, spawn: s2.spawn, force: true })
      expect(s2.calls.length).toBe(1)
    })
  })
})

// ── fingerprint skip ────────────────────────────────────────────────────────

import { existsSync } from 'node:fs'

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
    // fingerprint files written
    expect(existsSync(join(cwd, '.proman/build/@test-core.fingerprint'))).toBe(true)
    expect(existsSync(join(cwd, '.proman/build/@test-fs.fingerprint'))).toBe(true)
    expect(existsSync(join(cwd, '.proman/build/@test-cli.fingerprint'))).toBe(true)
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
})
