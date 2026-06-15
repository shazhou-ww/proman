---
id: dev-commands
title: "Dev Commands (build/test/check/format)"
sources:
  - packages/core/src/commands/dev.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Dev Commands (build/test/check/format)

## Overview

The dev commands (`build`, `test`, `check`, `format`) are the day-to-day development tools. They share a common options interface, fingerprint integration pattern, and spawn-based execution model. All are exported from `commands/dev.ts`.

## Shared Interface

```typescript
type DevCommandOptions = {
  cwd: string         // monorepo root
  spawn?: SpawnFn     // injectable for testing
  force?: boolean     // fingerprint control (see fingerprint-cache card)
}
```

## Command Summary

| Command | Scope | Tool | Fingerprint |
|---------|-------|------|-------------|
| `build` | per-package | tsc/vite/esbuild | per-package with dep propagation |
| `test` | monorepo root | vitest | root-level (`**/*.ts` + `package.json`) |
| `check` | monorepo root | biome + uwf | root-level (`**/*.ts` + `package.json` + `biome.json`) |
| `format` | monorepo root | biome | none (always runs) |

## Build — Per-Package Type Strategies

The build command iterates packages in config order (assumed topo-sorted) and selects a strategy by `PackageType`:

| Type | Build Command | Notes |
|------|---------------|-------|
| `lib` | `pnpm exec tsc --build` | TypeScript project references |
| `api` | `pnpm exec tsc --build` | Same as lib |
| `cli` | `pnpm run build` or `tsc --build` | Prefers package's own build script if exists |
| `webui` | `pnpm exec vite build` | Vite for frontend bundles |

### Build Pre-Clean

Before each package build:
1. Remove `dist/` directory (prevents stale artifacts, also invalidates build fingerprint)
2. Remove `tsconfig.tsbuildinfo` (forces full tsc rebuild)

### Post-Build: chmod bin entries

After building a package, any `bin` entries in `package.json` get `chmod 0o755`. This ensures CLI executables remain runnable after `tsc` rebuilds (which creates new files without execute permissions).

## Test

Runs `pnpm exec vitest run` from the monorepo root. Single invocation covers all packages (vitest discovers workspace configs). Fingerprinted at root level covering all `**/*.ts` and `package.json` files.

## Check

Two-phase validation:

1. **Biome lint** — `pnpm exec biome check .` from monorepo root
2. **Workflow validation** — discovers `.workflows/*.yaml` and `.workflow/*.yaml`, validates each with `uwf workflow validate`

### Workflow Validation Details

- Searches both `.workflows/` and `.workflow/` (legacy) directories
- Gracefully skips if `uwf` CLI is not installed (`which uwf` check)
- Collects all validation errors, then throws a combined error message
- Counts validated workflows: `✓ N workflow(s) validated`

## Format

Runs `pnpm exec biome format --write .` from monorepo root. No fingerprint caching — format is always executed (it's fast and mutates files, making caching unreliable).

## Execution Pattern

All commands use the same pattern:
1. Resolve `cwd` to absolute path
2. Load config (for build/deploy) or operate on root (test/check/format)
3. Optionally check fingerprint → skip if unchanged
4. Execute via `runOrThrow(spawn, argv, dir)` — throws on non-zero exit
5. Write fingerprint on success (if enabled)

## CI Integration

The CLI layer passes `force: isCI || userForceFlag`, where `isCI = process.env.CI === 'true' || process.env.CI === '1'`. This means CI always runs all commands regardless of fingerprint state, and always updates fingerprints afterward (useful if fingerprints are cached between CI runs).