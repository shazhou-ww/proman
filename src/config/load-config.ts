import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PromanConfig, ReleaseConfig } from './types.ts'
import { validateConfig } from './validate-config.ts'

const DEFAULT_REGISTRY = 'https://registry.npmjs.org'
const DEFAULT_GIT_TAG_PREFIX = 'v'

function applyDefaults(config: PromanConfig): PromanConfig {
  const release: ReleaseConfig = {
    registry: config.release?.registry ?? DEFAULT_REGISTRY,
    gitTagPrefix: config.release?.gitTagPrefix ?? DEFAULT_GIT_TAG_PREFIX,
  }
  if (config.release?.access !== undefined) {
    release.access = config.release.access
  }
  return { ...config, release }
}

/**
 * Loads `proman.config.ts` from the given cwd (or `process.cwd()`).
 * Bun natively transpiles TypeScript via `await import`, satisfying
 * the dynamic-load requirement for the issue.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<PromanConfig> {
  const absPath = resolve(cwd, 'proman.config.ts')
  if (!existsSync(absPath)) {
    throw new Error(`proman.config.ts not found at ${absPath}`)
  }

  // Cache-bust so repeated loads in tests pick up different fixtures.
  const url = `${absPath}?t=${Date.now()}-${Math.random()}`
  const mod = (await import(url)) as { default?: unknown }
  const raw = mod.default
  if (raw === undefined) {
    throw new Error(`Invalid proman config: ${absPath} has no default export`)
  }
  const validated = validateConfig(raw)
  return applyDefaults(validated)
}
