import { chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig } from '../config/index.ts'
import {
  computeBuildFingerprints,
  computeRootFingerprint,
  fingerprintPath,
  readFingerprint,
  writeFingerprint,
} from '../utils/fingerprint.ts'
import { defaultSpawn, runOrThrow, type SpawnFn } from '../utils/npm.ts'

export type DevCommandOptions = {
  cwd: string
  spawn?: SpawnFn
  /** When provided, enables fingerprint caching.
   *  - false: check fingerprint, skip if match
   *  - true: always run (--force / CI)
   *  - undefined: legacy behavior — always run, no fingerprint logic */
  force?: boolean
}

function pnpmExec(bin: string, ...args: string[]): string[] {
  return ['pnpm', 'exec', bin, ...args]
}

export async function build(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const useFingerprint = opts.force !== undefined
  const force = opts.force ?? false

  // Compute fingerprints only when fingerprint caching is enabled
  const fingerprints = useFingerprint ? computeBuildFingerprints(cwd, cfg.packages) : null

  // Determine which packages to build
  const toRun: { idx: number; pkgDir: string; fpPath: string; fpValue: string }[] = []

  for (let i = 0; i < cfg.packages.length; i++) {
    const pkg = cfg.packages[i] as (typeof cfg.packages)[number]
    const pkgDir = resolve(cwd, pkg.path)

    const fpPath = fingerprintPath(pkgDir, 'build', pkg.name)
    const fpValue = fingerprints?.get(pkg.name) ?? ''

    if (useFingerprint && !force) {
      const stored = readFingerprint(fpPath)
      if (stored === fpValue) {
        console.log(`⏭ build: ${pkg.name} (unchanged)`)
        continue // skip — fingerprint matches
      }
    }

    toRun.push({ idx: i, pkgDir, fpPath, fpValue })
  }

  // Execute builds
  for (const { idx, pkgDir } of toRun) {
    const pkg = cfg.packages[idx] as (typeof cfg.packages)[number]
    // Clean output dir + tsbuildinfo before build to prevent stale artifacts
    const outDir = join(pkgDir, 'dist')
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true })
    }
    const buildInfo = join(pkgDir, 'tsconfig.tsbuildinfo')
    if (existsSync(buildInfo)) {
      rmSync(buildInfo)
    }
    let argv: string[]
    switch (pkg.type) {
      case 'webui':
        argv = pnpmExec('vite', 'build')
        break
      default:
        // lib | cli | api → tsc --build
        argv = pnpmExec('tsc', '--build')
        break
    }
    await runOrThrow(spawn, argv, pkgDir)

    // chmod +x bin entries so linked CLIs survive tsc rebuild
    chmodBinEntries(pkgDir)
  }

  // Write fingerprints only after ALL builds succeed (and only when enabled)
  if (useFingerprint) {
    for (const { fpPath, fpValue } of toRun) {
      writeFingerprint(fpPath, fpValue)
    }
  }
}

function chmodBinEntries(pkgDir: string): void {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return
  const json = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const bin: unknown = json.bin
  if (bin == null) return
  const paths =
    typeof bin === 'string'
      ? [bin]
      : typeof bin === 'object'
        ? Object.values(bin as Record<string, string>)
        : []
  for (const rel of paths) {
    const abs = resolve(pkgDir, rel)
    if (existsSync(abs)) {
      chmodSync(abs, 0o755)
    }
  }
}

export async function runTests(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const useFingerprint = opts.force !== undefined
  const force = opts.force ?? false

  if (useFingerprint) {
    const fpPath = fingerprintPath(cwd, 'test')
    const fpValue = computeRootFingerprint(cwd, 'test')

    if (!force) {
      const stored = readFingerprint(fpPath)
      if (stored === fpValue) {
        console.log('⏭ test (unchanged)')
        return // skip
      }
    }

    await runOrThrow(spawn, pnpmExec('vitest', 'run'), cwd)
    writeFingerprint(fpPath, fpValue)
  } else {
    await runOrThrow(spawn, pnpmExec('vitest', 'run'), cwd)
  }
}

export async function check(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const useFingerprint = opts.force !== undefined
  const force = opts.force ?? false

  if (useFingerprint) {
    const fpPath = fingerprintPath(cwd, 'check')
    const fpValue = computeRootFingerprint(cwd, 'check')

    if (!force) {
      const stored = readFingerprint(fpPath)
      if (stored === fpValue) {
        console.log('⏭ check (unchanged)')
        return // skip
      }
    }

    await runOrThrow(spawn, pnpmExec('biome', 'check', '.'), cwd)
    writeFingerprint(fpPath, fpValue)
  } else {
    await runOrThrow(spawn, pnpmExec('biome', 'check', '.'), cwd)
  }
}

export async function format(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  await runOrThrow(spawn, pnpmExec('biome', 'format', '--write', '.'), cwd)
}
