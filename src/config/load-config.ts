import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import type { PackageManager, PromanConfig, ReleaseConfig } from './types.ts'
import { validateConfig } from './validate-config.ts'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_GIT_TAG_PREFIX = 'v'

function detectPackageManager(cwd: string): PackageManager {
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(resolve(cwd, 'bun.lockb')) || existsSync(resolve(cwd, 'bun.lock'))) return 'bun'
  return 'npm'
}

function applyDefaults(config: PromanConfig, cwd: string): PromanConfig {
  const release: ReleaseConfig = {
    registry: config.release?.registry ?? DEFAULT_REGISTRY,
    gitTagPrefix: config.release?.gitTagPrefix ?? DEFAULT_GIT_TAG_PREFIX,
  }
  if (config.release?.access !== undefined) {
    release.access = config.release.access
  }
  const packageManager = config.packageManager ?? detectPackageManager(cwd)
  return { ...config, packageManager, release }
}

/**
 * Loads `proman.yaml` from the given cwd (or `process.cwd()`).
 */
export function loadConfig(cwd: string = process.cwd()): PromanConfig {
  const absPath = resolve(cwd, 'proman.yaml')
  if (!existsSync(absPath)) {
    throw new Error(`proman.yaml not found at ${absPath}`)
  }
  const text = readFileSync(absPath, 'utf8')
  const raw = parse(text)
  const validated = validateConfig(raw)
  return applyDefaults(validated, cwd)
}
