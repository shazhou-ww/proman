---
id: fingerprint-cache
title: "Fingerprint Caching Strategy"
sources:
  - packages/core/src/utils/fingerprint.ts
  - packages/core/src/commands/dev.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Fingerprint Caching Strategy

## Purpose

proman uses content-hash fingerprinting to skip redundant `build`, `test`, and `check` runs. If source files haven't changed since the last successful execution, the command exits early with a "⏭ (unchanged)" message. This provides CI-like caching locally without external infrastructure.

## Hash Algorithm

All fingerprints use SHA-256. The hash input for a file set is:

```
for each file (sorted by relative path):
  hash.update(relativePath + '\0' + fileContent + '\0')
```

Including the relative path in the hash ensures renames are detected even when content is unchanged.

## File Collection

`collectFiles(baseDir, patterns)` walks the directory tree with hard-coded exclusions:
- `node_modules/`, `.git/`, `dist/`, `.proman/` — always skipped

Pattern matching supports:
- `**/*.ext` — recursive glob (any depth)
- `dir/**/*.ext` — scoped recursive glob
- `package.json` — exact filename match

## Two Fingerprinting Strategies

### 1. Per-Package with Dependency Propagation (`computeBuildFingerprints`)

Used by: **build**

Each package's fingerprint combines:
- Own source hash: `src/**/*.ts` + `package.json` + `tsconfig.json`
- Dependency fingerprints: for each workspace dep (from `package.json`), include that dep's already-computed fingerprint

```
fingerprint(pkg) = sha256(ownHash + sort(deps).map(d => d.name + '\0' + fingerprint(d) + '\0'))
```

Packages are processed in order (assumed topo-sorted in `proman.yaml`), so dependencies are always computed before their dependents. If package `core` changes, `cli` (which depends on `core`) automatically gets a new fingerprint.

### 2. Root-Level Monorepo Hash (`computeRootFingerprint`)

Used by: **test**, **check**

A single hash across the entire monorepo:
- test: `**/*.ts` + `package.json`
- check: `**/*.ts` + `package.json` + `biome.json`

This is simpler because `vitest run` and `biome check .` operate on the whole workspace.

## Storage Paths

Fingerprint storage is deliberately split by command type:

| Command | Path | Rationale |
|---------|------|-----------|
| `build` | `<pkg>/dist/.build-fingerprint` | Lives inside `dist/` — `rm -rf dist` (clean build) auto-invalidates |
| `test` | `.proman/test/root.fingerprint` | Independent of build artifacts, survives `dist/` cleanup |
| `check` | `.proman/check/root.fingerprint` | Same isolation as test |

## Three-State Force Behavior

The `force` option on `DevCommandOptions` has three semantic states:

| Value | Behavior |
|-------|----------|
| `undefined` | Legacy mode — always run, no fingerprint logic at all |
| `false` | Check fingerprint, skip if match |
| `true` | Always run, update fingerprint after (used by `--force` flag and CI) |

The CLI sets `force: isCI || userForceFlag`, so CI always runs and always updates the stored fingerprint.

## Atomicity Guarantee

Fingerprints are written **only after successful execution**:

```typescript
// Build: write fingerprints only after ALL builds succeed
for (const { fpPath, fpValue } of toRun) {
  writeFingerprint(fpPath, fpValue)
}
```

If a build/test/check fails midway, no fingerprint is persisted — the next run will retry. This prevents a failed run from being incorrectly cached as "done".

## Build Command Specifics

The build command adds extra behaviors around fingerprinting:
- **Clean before build** — removes `dist/` and `tsconfig.tsbuildinfo` before each package build (prevents stale artifacts)
- **chmod bin entries** — after build, applies `0o755` to any `bin` entries from `package.json` so linked CLIs remain executable
- **Type-based strategy** — `lib`/`api` → `tsc --build`, `cli` → package build script or `tsc`, `webui` → `vite build`