# Changelog

## 0.9.2 — 2026-06-13

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

## 0.9.1 — 2026-06-13

- Fix workspace:* dependency not resolved during npm publish
  
  v0.9.0 was published with `npm publish` which does not resolve pnpm workspace
  protocol. Re-publish with `proman publish` (uses `pnpm publish`) to correctly
  resolve `workspace:*` to the actual version number.

## 0.9.0 — 2026-06-13

- Fix npm/pnpm inconsistencies in smoke test comments and error messages
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
- Add smoke test for package tarballs before npm publish
  
  Before publishing to npm, proman now validates that the packaged tarball actually works by:
  - Running `npm pack` to create the tarball
  - Extracting it to a temporary directory
  - Executing `<bin> --version` for each bin entry
  - Aborting publish if any bin command fails
  
  This catches issues like missing files, broken imports, or incorrect package.json configuration before they reach npm, preventing broken releases.
  
  Packages without bin entries skip the smoke test automatically.
- feat: validate workflow YAML in proman check
  
  `proman check` now discovers `.workflows/*.yaml` and `.workflow/*.yaml` files
  and validates each with `uwf workflow validate`. If uwf is not installed,
  validation is skipped with a warning.

