---
scenario: "Root directory cleanup after monorepo migration"
feature: "refactor"
tags: [monorepo, migration, cleanup]
---

## Given
- proman has been migrated to monorepo structure (packages/core + packages/cli)
- Root directory previously contained `src/` with 20 TypeScript files
- Root `package.json` previously defined the CLI package
- Root `tsconfig.json` previously compiled root `src/`

## When
- Migration is complete and all source code moved to `packages/`

## Then
- Root `src/` directory is deleted (0 files remain)
- Root `package.json`:
  - Has `"private": true`
  - Has `"name": "@shazhou/proman-workspace"` or similar workspace name (not `@shazhou/proman`)
  - Does NOT have `"bin"` field
  - Does NOT reference `dist/` in any scripts
- Root `tsconfig.json`:
  - Does NOT include `"src/**/*"` in the `include` array
  - Only includes `packages/*/src/**/*` or delegates to package-level tsconfig files
