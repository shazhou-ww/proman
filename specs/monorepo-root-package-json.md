---
scenario: "Root package.json workspace configuration"
feature: "refactor"
tags: [monorepo, workspace, package-json]
---

## Given
- proman monorepo with `packages/cli/` and `packages/core/`
- Root directory serves as workspace coordinator
- CLI package at `packages/cli/` publishes as `@shazhou/proman`

## When
- Inspecting root `package.json`

## Then
- Root `package.json` is marked `"private": true` (unpublishable)
- Root `package.json` name does NOT conflict with any package:
  - NOT `@shazhou/proman` (conflicts with packages/cli)
  - NOT `@shazhou/proman-core` (conflicts with packages/core)
  - Should be `@shazhou/proman-workspace` or similar workspace identifier
- Root `package.json` has NO `"bin"` field (CLI entry point is in packages/cli/package.json only)
- Root `package.json` scripts delegate to workspace packages via `pnpm -r` or similar
- No references to root-level `dist/` directory (build outputs go to `packages/*/dist/`)
