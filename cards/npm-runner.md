---
id: npm-runner
title: "NPM Runner and Spawn Abstraction"
sources:
  - packages/core/src/utils/npm.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# NPM Runner and Spawn Abstraction

## Overview

`npm.ts` provides the process-spawning infrastructure used throughout proman. It defines the `SpawnFn` type for dependency injection, the `NpmRunner` interface for pnpm operations, registry fetch utilities, and RC (release candidate) version helpers.

## SpawnFn — The Process Execution Primitive

```typescript
type SpawnFn = (
  argv: string[],
  cwd: string,
) => Promise<{ code: number; stdout: string; stderr: string }>
```

Every command that runs external processes accepts an optional `SpawnFn`. This single abstraction point enables:
- **Unit testing** — inject a mock that records calls and returns canned results
- **Consistent error handling** — all process output flows through one shape

### Default Implementation (`defaultSpawn`)

- Uses `spawnSync` from `node:child_process` (synchronous but wrapped in async for interface compatibility)
- Captures stdout/stderr via `stdio: 'pipe'`
- **Forwards output** to the terminal (`process.stdout.write` / `process.stderr.write`) so users see progress in real-time
- Returns exit code (defaults to 1 if `result.status` is null)

## runOrThrow — Fail-Fast Execution

```typescript
async function runOrThrow(spawn: SpawnFn, argv: string[], cwd: string): Promise<void>
```

Wraps `spawn` and throws on non-zero exit code. Error message includes the command and stderr (or stdout if stderr is empty). Used by virtually all command implementations.

## NpmRunner — High-Level pnpm Interface

```typescript
type NpmRunner = {
  install: () => Promise<void>   // pnpm install
  build: () => Promise<void>     // pnpm run build
  test: () => Promise<void>      // pnpm exec vitest run
  check: () => Promise<void>     // pnpm run check
  format: () => Promise<void>    // pnpm run format
  publish: (pkgDir: string, opts: PublishOptions) => Promise<void>
}
```

### Factory: `createNpmRunner(cwd, spawn?)`

Creates a bound `NpmRunner` for a given working directory. Internal pattern:
- `runScript(name)` — factory for `pnpm run <script>` commands (used by build, check, format)
- `install` — direct `pnpm install`
- `test` — `pnpm exec vitest run` (not a script, direct binary)
- `publish` — `pnpm publish --tag <tag> --no-git-checks [--access <access>]`

The `--no-git-checks` flag skips pnpm's git state validation (proman manages git separately).

## NpmRegistryFetch — Version Query

```typescript
type NpmRegistryFetch = (pkg: string) => Promise<string[]>
```

Returns all published version strings for a package. Default implementation:
- Fetches from `https://registry.npmjs.org/<pkg>`
- Returns `Object.keys(json.versions)` on success
- Returns `[]` on 404 (new package, never published)
- Throws on other HTTP errors

## RC Version Helpers

Three pure functions for release candidate management:

| Function | Input | Output |
|----------|-------|--------|
| `parseReleaseBranch` | `"release/1.2.0"` | `"1.2.0"` |
| `nextRcNumber` | `{ baseVersion: "1.2.0", existing: ["1.2.0-rc.1", "1.2.0-rc.2"] }` | `3` |
| `formatRcVersion` | `("1.2.0", 3)` | `"1.2.0-rc.3"` |

Workflow: parse branch name → query registry for existing versions → compute next RC number → format version string.

## Design Pattern: Interface + Factory + DI

The file demonstrates proman's consistent testability pattern:

```
Interface (type)  →  Factory (createXxx)  →  Default impl  →  DI via options
     ↓                                             ↓
  Mock in tests                              Real in production
```

This pattern is shared with `GitOps` (git.ts) and appears throughout the codebase.