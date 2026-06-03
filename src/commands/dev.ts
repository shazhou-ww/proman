import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig } from '../config/index.ts'
import { type SpawnFn, defaultSpawn } from '../utils/npm.ts'

export type DevCommandOptions = {
  cwd: string
  spawn?: SpawnFn
}

async function runOrThrow(spawn: SpawnFn, argv: string[], cwd: string): Promise<void> {
  const { code, stdout, stderr } = await spawn(argv, cwd)
  if (code !== 0) {
    throw new Error(`${argv.join(' ')} failed: ${stderr.trim() || stdout.trim()}`)
  }
}

function execArgv(pm: string, bin: string, args: string[]): string[] {
  if (pm === 'bun') return ['bunx', bin, ...args]
  return [pm, 'exec', bin, ...args]
}

export async function build(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'
  for (const pkg of cfg.packages) {
    const pkgDir = resolve(cwd, pkg.path)
    // Clean output dir before build to prevent stale artifacts
    const outDir = join(pkgDir, 'dist')
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true })
    }
    let argv: string[]
    switch (pkg.type) {
      case 'webui':
        argv = execArgv(pm, 'vite', ['build'])
        break
      default:
        // lib | cli | api → tsc --build
        argv = execArgv(pm, 'tsc', ['--build'])
        break
    }
    await runOrThrow(spawn, argv, pkgDir)
  }
}

export async function runTests(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'
  const argv = pm === 'bun' ? ['bun', 'test'] : [pm, 'run', 'test']
  await runOrThrow(spawn, argv, cwd)
}

export async function check(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'
  await runOrThrow(spawn, execArgv(pm, 'biome', ['check', '.']), cwd)
}

export async function format(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'
  await runOrThrow(spawn, execArgv(pm, 'biome', ['format', '--write', '.']), cwd)
}
