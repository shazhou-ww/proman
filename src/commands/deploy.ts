import { resolve } from 'node:path'
import { loadConfig } from '../config/index.ts'
import { type SpawnFn, defaultSpawn } from '../utils/npm.ts'

export type DeployCommandOptions = {
  cwd: string
  pkg?: string
  env?: string
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

export async function deploy(opts: DeployCommandOptions): Promise<void> {
  const spawn = opts.spawn ?? defaultSpawn
  const cwd = resolve(opts.cwd)
  const cfg = loadConfig(cwd)
  const pm = cfg.packageManager ?? 'npm'

  let targets = cfg.packages
  if (opts.pkg !== undefined) {
    const match = cfg.packages.find((p) => p.name === opts.pkg)
    if (!match) {
      throw new Error(`package not found: ${opts.pkg}`)
    }
    if (match.type !== 'webui' && match.type !== 'api') {
      throw new Error(
        `package ${opts.pkg} (type=${match.type}) is not deployable; cannot deploy non-webui/api packages`,
      )
    }
    targets = [match]
  } else {
    targets = cfg.packages.filter((p) => p.type === 'webui' || p.type === 'api')
  }

  for (const pkg of targets) {
    const pkgDir = resolve(cwd, pkg.path)
    let argv: string[]
    if (pkg.type === 'webui') {
      argv = execArgv(pm, 'wrangler', ['pages', 'deploy', 'dist'])
    } else if (pkg.type === 'api') {
      argv = execArgv(pm, 'wrangler', ['deploy'])
    } else {
      continue
    }
    if (opts.env !== undefined) {
      argv.push('--env', opts.env)
    }
    await runOrThrow(spawn, argv, pkgDir)
  }
}
