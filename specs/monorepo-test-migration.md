---
scenario: "Test files migrated from root to core package with correct imports"
feature: test
tags: [monorepo, migration, refactor]
---

## Given
- Root `tests/` directory exists with 16 test files
- All test files import from `../src/` which no longer exists after monorepo migration
- Source code has been moved to `packages/core/src/`
- Root `tests/fixtures/` directory contains test fixture data

## When
- Migrating tests from root to core package

## Then
- All 16 test files are moved to `packages/core/tests/`
- `tests/fixtures/` directory is moved to `packages/core/tests/fixtures/`
- All imports are updated from `../src/` to `../src/` (relative to core package)
  - Example: `import { loadConfig } from '../src/config/index.ts'` remains valid
  - Example: `import { bump } from '../src/commands/bump.ts'` remains valid
- Root `tests/` directory is removed
- `pnpm test` passes in both root and core package
- Test coverage is preserved for bump, publish, config loading, fingerprinting, linking, deployment, and other core functionality

## Files to migrate
- `tests/build-fingerprint-integration.test.ts`
- `tests/bump.test.ts`
- `tests/changeset.test.ts`
- `tests/cli.test.ts`
- `tests/deploy.test.ts`
- `tests/dev.test.ts`
- `tests/fingerprint.test.ts`
- `tests/link.test.ts`
- `tests/load-config.test.ts`
- `tests/npm.test.ts`
- `tests/publish.test.ts`
- `tests/smoke-test.test.ts`
- `tests/validate-config.test.ts`
- `tests/version.test.ts`
- `tests/workflow-schema.test.ts`
- `tests/workspace.test.ts`
- `tests/fixtures/` (entire directory)
