import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config/index.ts'
import { type SpawnFn, defaultSpawn } from '../utils/npm.ts'

export type DevCommandOptions = {
  cwd: string
  spawn?: SpawnFn
}

const HERE = dirname(fileURLToPath(import.meta.url))

export function findBin(name: string): string {
  // Walk up from this file looking for node_modules/.bin/<name>
  let dir = HERE
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'node_modules', '.bin', name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // Fall back to PATH-resolved binary name
  return name
}

async function runOrThrow(spawn: SpawnFn, argv: string[], cwd: string): Promise<void> {
  const { code, stdout, stderr } = await spawn(argv, cwd)
  if (code !== 0) {
    throw new Error(`${argv.join(' ')} failed: ${stderr.trim() || stdout.trim()}`)
  }
}

export async function build(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  for (const pkg of cfg.packages) {
    const pkgDir = resolve(cwd, pkg.path)
    let argv: string[]
    switch (pkg.type) {
      case 'webui':
        argv = [findBin('vite'), 'build']
        break
      default:
        // lib | cli | api → tsc --build
        argv = [findBin('tsc'), '--build']
        break
    }
    await runOrThrow(spawn, argv, pkgDir)
  }
}

export async function runTests(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const argv = cfg.runtime === 'bun' ? ['bun', 'test'] : ['npm', 'test']
  await runOrThrow(spawn, argv, cwd)
}

export async function check(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  await runOrThrow(spawn, [findBin('biome'), 'check', '.'], cwd)
}

export async function format(opts: DevCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  await runOrThrow(spawn, [findBin('biome'), 'format', '--write', '.'], cwd)
}
