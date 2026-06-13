---
scenario: "Initialize monorepo structure with packages/core and packages/cli"
feature: init
tags: [monorepo, structure, refactor]
---

## Given
- proman is currently a single package with `src/` directory
- No `packages/` directory exists
- No `proman.yaml` exists

## When
- Initialize monorepo structure with:
  ```bash
  mkdir -p packages/core packages/cli
  ```

## Then
- `packages/core/` directory exists for @shazhou/proman-core
- `packages/cli/` directory exists for @shazhou/proman
- Each package has its own `package.json`
- `packages/core/package.json` has name `@shazhou/proman-core`
- `packages/cli/package.json` has name `@shazhou/proman`
- Root `proman.yaml` is created to manage the monorepo
