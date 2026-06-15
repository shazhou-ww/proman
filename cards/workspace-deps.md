---
id: workspace-deps
title: "Workspace Dependency Rewriting"
sources:
  - packages/core/src/utils/workspace.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Workspace Dependency Rewriting

## Purpose

pnpm's `workspace:*` protocol allows monorepo packages to reference each other during development without pinning versions. Before publishing to npm, these must be rewritten to concrete version strings — the registry doesn't understand `workspace:*`.

This utility resolves `workspace:*` → actual version numbers by looking up each dependency's version from its own `package.json`.

## Core Function: `rewriteWorkspaceDeps`

```typescript
function rewriteWorkspaceDeps(manifests: PkgManifest[]): {
  rewritten: PkgManifest[]
  unresolved: Unresolved[]
}
```

Takes all package manifests as input, builds a version lookup map, then rewrites:

1. **Build version map** — `Map<packageName, version>` from all manifests
2. **For each manifest** — scan both `dependencies` and `devDependencies`
3. **For each `workspace:*` entry** — replace with the concrete version from the map
4. **Track unresolved** — if a `workspace:*` dep doesn't appear in the manifest list, it's reported (not thrown)

### Example

```
Before: { "dependencies": { "@shazhou/proman-core": "workspace:*" } }
After:  { "dependencies": { "@shazhou/proman-core": "1.2.3" } }
```

## Filesystem Function: `applyWorkspaceRewrites`

```typescript
async function applyWorkspaceRewrites(
  rootDir: string,
  packages: { name: string; path: string }[],
): Promise<string[]>  // returns paths of changed files
```

Higher-level orchestrator that:
1. Reads all `package.json` files from disk
2. Calls `rewriteWorkspaceDeps` on the parsed manifests
3. Writes back only the files that actually changed (JSON comparison)
4. Returns the list of modified file paths

## Design Decisions

- **Pure core + IO wrapper** — `rewriteWorkspaceDeps` is pure (testable with mock data); `applyWorkspaceRewrites` handles filesystem I/O.
- **Non-destructive on non-workspace deps** — only entries with exactly `"workspace:*"` are rewritten. Other version specs (`^1.0.0`, `~2.0.0`, etc.) pass through unchanged.
- **Unresolved tracking** — rather than throwing on unresolvable deps, collects them as `{ pkg, dep }` pairs. Callers can decide whether to error or warn.
- **Minimal writes** — compares JSON serialization before/after and only writes files that actually changed, avoiding unnecessary git noise.

## Type

```typescript
type PkgManifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [k: string]: unknown  // preserves all other fields
}
```

The spread-copy approach (`{ ...m }`) preserves all other `package.json` fields (bin, scripts, etc.) without explicitly enumerating them.

## Integration

Used by the publish pipeline to ensure workspace packages reference concrete versions before `pnpm publish`. The rewriting happens in-place on disk, so the git commit step in the publish flow captures the version changes.