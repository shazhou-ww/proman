# Changelog

## 0.9.1 — 2026-06-13

- Update release workflow for monorepo and fix smoke test workspace deps
  
  **release.yaml v2**: Updated for monorepo structure — uses `proman bump` and
  `proman publish` instead of raw `npm version`/`pnpm publish`. Preflight checks
  all packages' versions on npm. Publisher verifies `workspace:*` was resolved
  correctly after publish.
  
  **smoke-test**: `smokeTestTarball` now accepts `workspacePackages` map and
  symlinks workspace dependencies into extracted tarball's `node_modules/`,
  fixing smoke test failure for packages with workspace deps (e.g. CLI → core).
  
  **smoke-test parse fix**: Extract `.tgz` filename from pnpm pack verbose output
  via regex instead of treating entire stdout as filename.
  
  **docs**: Renamed `lint` → `check` across all documentation and pre-push hook.

## 0.9.0 — 2026-06-13

- Refactor proman into a monorepo with `@shazhou/proman-core` and `@shazhou/proman` packages.
  
  **Breaking**: None - CLI interface remains unchanged
  
  **New packages**:
  - `@shazhou/proman-core` - Core library with config loader, utils, and command logic as pure functions for programmatic use
  - `@shazhou/proman` - CLI package that parses args and delegates to core functions
  
  **Features**:
  - Proman now manages itself as a monorepo (dogfooding)
  - Single-package projects work as one-package monorepos (eliminates need for unirepo support)
  - Core exports are pure functions with no CLI-specific side effects
  - Root `proman.yaml` configures packages array for monorepo management
  
  **Migration**: Users only need to upgrade the `@shazhou/proman` CLI package. The core package is automatically installed as a dependency.
- Migrate tests from root to package-specific directories and fix monorepo dependencies
  
  - Migrate all test files from root `tests/` to `packages/core/tests/` and `packages/cli/tests/`
  - Update test imports to reference correct package structure
  - Remove `yaml` dependency from root package.json (now only in core package where it's used)
  - Fix workflow schema test paths to reference root `.workflows/` directory

