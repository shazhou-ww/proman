---
scenario: "Root tsconfig.json references after monorepo migration"
feature: "refactor"
tags: [monorepo, typescript, tsconfig]
---

## Given
- proman migrated to monorepo with `packages/cli/` and `packages/core/`
- Each package has its own `tsconfig.json` for TypeScript compilation
- Root `tsconfig.json` previously included `src/**/*` for root-level TypeScript files

## When
- Inspecting root `tsconfig.json` after migration

## Then
- Root `tsconfig.json` does NOT include `"src/**/*"` in the `include` array
- Root `tsconfig.json` either:
  - Has `"include": ["packages/*/src/**/*", "tests/**/*"]` to provide IDE support, OR
  - Has `"include": ["tests/**/*"]` only and delegates compilation to package-level tsconfig.json files
- Root `src/` directory no longer exists, so no TypeScript errors from missing references
