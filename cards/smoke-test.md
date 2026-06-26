---
id: smoke-test
title: "Smoke Test Mechanism"
sources:
  - packages/core/src/utils/smoke-test.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-26
---

# Smoke Test Mechanism

## Purpose

Smoke testing validates that a package's published artifact actually works before it reaches the npm registry. It runs as part of the publish pipeline (per-package, before `npm publish`) and catches issues like missing files in the tarball, broken imports, or non-functional bin entries.

## Strategy Priority

The smoke test uses a three-tier priority system:

| Priority | Condition | Action |
|----------|-----------|--------|
| 1 | `package.json` has a `"smoke"` script | Run `pnpm run smoke` |
| 2 | No smoke script, but has `bin` entries | Tarball extraction + `--version` |
| 3 | Neither smoke script nor bin entries | Skip entirely |

## Custom Smoke Script (Priority 1)

If a `"smoke"` script exists in `package.json`, it's executed via `pnpm run smoke`. This allows packages to define their own validation logic (e.g., import testing, feature verification). Non-zero exit code means failure.

## Tarball Strategy (Priority 2)

The default strategy for CLI packages validates that the packaged binary actually runs:

### Steps

```
pnpm pack → tar extract → symlink workspace deps → pnpm install --prod → node <bin> --version → cleanup
```

1. **Pack** — `pnpm pack` creates a `.tgz` tarball in the package directory. The filename is extracted from stdout via regex (`/[\w@.-]+\.tgz/`).

2. **Extract** — tarball is extracted to a temp directory (`/tmp/proman-smoke-XXXXX`). pnpm pack always creates a `package/` subdirectory inside the tarball.

3. **Symlink workspace dependencies** — for each workspace dependency listed in `package.json`, a symlink is created in the extracted `node_modules/`:
   ```
   node_modules/@shazhou/proman-core → /abs/path/to/packages/core
   ```
   Handles scoped packages by creating the `@scope/` parent directory. This allows bin commands to resolve workspace imports without running `npm install`.

4. **Install production dependencies** — `pnpm install --prod` runs in the extracted `package/` directory. Workspace deps are already symlinked, but external (registry) dependencies such as `@ocas/cli-kit`, `zod`, `yaml`, and `liquidjs` are **not** in the tarball. Without this step the bin fails at runtime with `ERR_MODULE_NOT_FOUND` (issue #217). pnpm is used (not `npm`), and `--prod` installs only `dependencies` (devDependencies skipped). A non-zero exit aborts the smoke test before any bin runs, with an error matching the existing `pnpm pack failed: …` / `tar extract failed: …` pattern.

5. **Run bin entries** — each `bin` entry is executed with `node <path> --version`. The test passes if all exit with code 0.

6. **Cleanup** — always runs (in `finally` block): removes both the temp directory and the tarball file. This runs even if `pnpm install --prod` or a bin command fails.

## Bin Entry Normalization

The `bin` field in `package.json` supports two formats:

```jsonc
// String form → uses package name as bin name
"bin": "./dist/cli.js"
// Normalized to: { "package-name": "./dist/cli.js" }

// Object form → used directly
"bin": { "proman": "./dist/cli.js" }
```

Both are normalized to `Record<string, string>` before testing.

## Workspace Package Map

The `WorkspacePackages` type maps package names to absolute disk paths:

```typescript
type WorkspacePackages = Record<string, string>
// e.g. { "@shazhou/proman-core": "/home/user/proman/packages/core" }
```

This is constructed by the publish command from `proman.yaml` packages and passed to `smokeTest()`. Without it, workspace dependencies would fail to resolve since the tarball is tested in an isolated temp directory.

## Error Reporting

On failure, errors include the bin name and stderr/stdout:
```
smoke test failed for bin 'proman': Cannot find module '@shazhou/proman-core'
```

The publish pipeline wraps this with context about which packages were already published and which remain.