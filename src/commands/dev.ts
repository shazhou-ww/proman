import { chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig } from '../config/index.ts'
import { defaultSpawn, type SpawnFn } from '../utils/npm.ts'

export type DevCommandOptions = {
  cwd: string
  spawn?: SpawnFn
}

async function runOrThrow(spawn: SpawnFn, argv: string[], cwd: string): Promise<void> {
  const { code, stdout, stderr } = await spawn(argv, cwd)
  if (code !== 0) {
    const detail = stderr.trim() || stdout.trim()
    throw new Error(detail ? `${argv.join(' ')} failed: ${detail}` : `${argv.join(' ')} failed`)
  }
}

function pnpmExec(bin: string, ...args: string[]): string[] {
  return ['pnpm', 'exec', bin, ...args]
}

export async function build(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  for (const pkg of cfg.packages) {
    const pkgDir = resolve(cwd, pkg.path)
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
}

function chmodBinEntries(pkgDir: string): void {
  const pkgJsonPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgJsonPath)) return
  const json = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const bin: unknown = json.bin
  if (bin == null) return
  const paths = typeof bin === 'string' ? [bin] : typeof bin === 'object' ? Object.values(bin as Record<string, string>) : []
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
  await runOrThrow(spawn, pnpmExec('vitest', 'run'), cwd)
}

export async function check(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  await runOrThrow(spawn, pnpmExec('biome', 'check', '.'), cwd)
}

export async function format(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  await runOrThrow(spawn, pnpmExec('biome', 'format', '--write', '.'), cwd)
}
