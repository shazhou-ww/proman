# Changelog

## 0.10.1 — 2026-06-24

- Strict build cache validation: verify all output artifacts exist before skipping rebuild.
  
  - Fingerprint format upgraded from plain hash to JSON { hash, outputs }
  - Added listOutputFiles() and isBuildCacheValid() for artifact completeness checks
  - Fixes #211: single dist artifact missing no longer silently skipped

## 0.10.0 — 2026-06-15

- feat: add `cards validate`, `cards affected`, and `cards toc` subcommands
  
  - `proman cards validate` — check frontmatter format (id, title, sources, tags)
  - `proman cards affected --since <ref>` — find stale cards and uncovered files based on git changelog
  - `proman cards toc` — output agent-friendly markdown table of all knowledge cards
  
  Also fixes `parseFrontmatter` handling of empty inline arrays (`tags: []`).
- feat: add `proman cards` subcommand family for project knowledge card index management
  
  New commands:
  - `proman cards index` — scan `cards/*.md`, parse frontmatter, generate `.cards-index.json`
  - `proman cards query --sources <files...>` — find cards by source file references
  - `proman cards query --tag <tag>` — filter cards by tag
  - `proman cards query --id <id>` — get full card details by id
  - `proman cards list` — list all indexed cards with id, title, tags
  - `proman cards orphans` — find source files not referenced by any card
  
  Index file structure: `by_source` (file → card ids) and `by_id` (id → title, sources, tags).
  `.cards-index.json` is added to `.gitignore` as a build artifact.
- feat: optimize smoke test strategy — use package.json smoke script when available
  
  Adds priority-based smoke testing:
  1. If a package has a "smoke" script in package.json, run `pnpm run smoke`
  2. If no smoke script but has bin entries, fallback to tarball `node <bin> --version`
  3. If neither, skip smoke testing entirely
  
  Also adds `--skip-smoke` flag to `proman publish` as an escape hatch.

## 0.9.2 — 2026-06-13

- Fix build regression: cli type falls back to tsc when no build script
  
  Since the monorepo refactor, `proman build` dispatched `pnpm run build`
  for all `cli`-type packages. This broke consumers (ocas, uwf) whose cli
  packages have no build script — they relied on proman's built-in
  `tsc --build`.
  
  Now cli-type packages check for a build script in package.json first.
  If present, use `pnpm run build`; otherwise fall back to `tsc --build`
  (same as lib/api types).

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

