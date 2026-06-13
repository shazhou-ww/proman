---
scenario: "Root package.json has no runtime dependencies in monorepo workspace"
feature: check
tags: [monorepo, architecture, dependencies]
---

## Given
- Repository is a pnpm workspace monorepo
- Root `package.json` has `"private": true` marking it as workspace root
- `packages/core/package.json` declares `yaml` as a runtime dependency
- Root `package.json` currently has `yaml` in `dependencies` field

## When
- Verifying workspace root package.json configuration

## Then
- Root `package.json` has no `dependencies` field
  - Or `dependencies` is an empty object `{}`
- `yaml` dependency exists only in `packages/core/package.json`
- No duplicate or conflicting versions of `yaml` across the workspace
- Root `package.json` contains only:
  - `devDependencies` (build/dev tooling like `@types/node`, `esbuild`)
  - `peerDependencies` (peer requirements like `@biomejs/biome`, `typescript`, etc.)
  - `scripts` (workspace orchestration commands)
  - workspace metadata (`name`, `private`, `version`, etc.)
- `pnpm install` installs `yaml` only in `packages/core/node_modules`
- Monorepo follows best practices: workspace root should only have build/dev tooling, not runtime dependencies
