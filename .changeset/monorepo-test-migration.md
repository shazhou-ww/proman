---
'@shazhou/proman-core': patch
'@shazhou/proman': patch
---

Migrate tests from root to package-specific directories and fix monorepo dependencies

- Migrate all test files from root `tests/` to `packages/core/tests/` and `packages/cli/tests/`
- Update test imports to reference correct package structure
- Remove `yaml` dependency from root package.json (now only in core package where it's used)
- Fix workflow schema test paths to reference root `.workflows/` directory
