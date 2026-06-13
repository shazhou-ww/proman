---
scenario: "Core package exports config loader, utils, and command logic as functions"
feature: build
tags: [core, exports, api]
---

## Given
- `packages/core/` contains migrated code from `src/config/`, `src/utils/`, `src/commands/`
- Core package is built and published

## When
- Import from `@shazhou/proman-core`:
  ```typescript
  import { loadConfig } from '@shazhou/proman-core';
  import { bump, publish, build } from '@shazhou/proman-core/commands';
  import { getFingerprint } from '@shazhou/proman-core/utils';
  ```

## Then
- Config loader functions are available: `loadConfig`, `validateConfig`, `resolveConfig`
- Command functions are available: `bump`, `publish`, `build`, `deploy`, `test`, `check`, `format`
- Utility functions are available: `getFingerprint`, `gitUtils`, `npmUtils`, `changesetUtils`
- All exports are pure functions (no CLI-specific side effects)
- All exports are properly typed with TypeScript definitions
