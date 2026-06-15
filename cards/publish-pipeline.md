---
id: publish-pipeline
title: "Publish Pipeline"
sources:
  - packages/core/src/commands/publish.ts
  - packages/core/src/utils/npm.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Publish Pipeline

## Overview

The `publish` command orchestrates a full release flow: validate → build → test → check → smoke → publish → commit → tag → push. It publishes all non-private packages in the monorepo in one atomic-ish operation, with RC (release candidate) support and partial-failure diagnostics.

## Pipeline Stages

```
install → build → test → check → [smoke → publish]×N → addAll → commit → tag → pushTags → push
```

| Stage | Can Skip? | Tool |
|-------|-----------|------|
| install | No | `pnpm install` |
| build | No | `pnpm run build` |
| test | `--skip-tests` | `pnpm exec vitest run` |
| check | No | `pnpm run check` |
| smoke test | `--skip-smoke` | per-package tarball validation |
| publish | No | `pnpm publish --tag <tag> --no-git-checks` |
| git commit | No | `release: v<version>` |
| git tag | No | `<pkgName>@v<version>` per package |
| push | No | tags + main branch |

## Package Filtering

Two levels of "private" checking:
1. `private: true` in `proman.yaml` package entry
2. `"private": true` in the package's `package.json`

Either one excludes the package from publishing. Private packages are logged as "⏭ skipped (private)".

## RC Version Handling

Versions matching `*-rc.\d+$` are published with npm tag `rc` instead of `latest`:

```typescript
const publishTag = isRcVersion(version) ? 'rc' : 'latest'
```

The `npm.ts` utility provides RC helpers:
- `parseReleaseBranch(branch)` — extracts version from `release/x.y.z` branch names
- `nextRcNumber({baseVersion, existing})` — finds the next RC number from existing versions
- `formatRcVersion(baseVersion, n)` — produces `x.y.z-rc.N`

## Pre-Publish Checks

Before each package is published:

1. **Registry version check** — queries the npm registry for existing versions via `NpmRegistryFetch`. If the target version is already published, the package is skipped (idempotent re-runs).
2. **Smoke test** — validates the tarball (see smoke-test card). Passes a workspace package map for symlink resolution.

## Error Recovery & Diagnostics

When a publish or smoke test fails mid-sequence, the error message includes:
- Which packages were already successfully published
- Which packages remain unpublished

```
publish failed for @shazhou/proman:
  published: @shazhou/proman-core
  unpublished: @shazhou/proman
```

Additionally, the "already published" npm error is caught as a race-condition fallback — if another process published the same version concurrently, it's treated as a skip rather than a failure.

## Git Operations

After all packages are published:
1. `git add -A` — stages any remaining changes
2. Commit with message `release: v<version>` and hardcoded author
3. Tag each published package: `<pkgName>@<tagPrefix><version>` (default prefix: `v`)
4. Push tags, then push `main` branch

Changelog generation and changeset cleanup are handled by the `bump` command, not `publish` (separation per issue #74).

## Dependency Injection

All external operations are injectable for testing:

| Interface | Default | Purpose |
|-----------|---------|---------|
| `GitOps` | `createGitOps(cwd)` | Git commit, tag, push |
| `NpmRunner` | `createNpmRunner(cwd)` | install, build, test, check, publish |
| `NpmRegistryFetch` | `defaultRegistryFetch` | Query registry for existing versions |
| `SpawnFn` | `defaultSpawn` | Execute child processes |

## NpmRunner Factory

`createNpmRunner(cwd, spawn?)` wraps pnpm commands behind the `NpmRunner` interface:

```typescript
type NpmRunner = {
  install: () => Promise<void>   // pnpm install
  build: () => Promise<void>     // pnpm run build
  test: () => Promise<void>      // pnpm exec vitest run
  check: () => Promise<void>     // pnpm run check
  format: () => Promise<void>    // pnpm run format
  publish: (pkgDir, opts) => Promise<void>  // pnpm publish --tag --no-git-checks
}
```

All commands use `runOrThrow` which throws on non-zero exit code with stderr/stdout as the error detail.