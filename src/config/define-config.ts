import type { PromanConfig } from './types.ts'

/**
 * Identity helper that provides TypeScript type inference at the call site.
 * Returns the input config unchanged.
 */
export function defineConfig(config: PromanConfig): PromanConfig {
  return config
}
