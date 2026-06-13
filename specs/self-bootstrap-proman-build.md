---
scenario: "Proman builds itself using proman build command"
feature: build
tags: [dogfooding, monorepo, self-bootstrap]
---

## Given
- `proman.yaml` exists at repo root
- `proman.yaml` defines packages: `packages/core` and `packages/cli`
- Dependencies are installed via `pnpm install`

## When
- Run build command:
  ```bash
  proman build
  ```

## Then
- Core package is built first (dependency order)
- CLI package is built after core
- `packages/core/dist/` contains compiled core code
- `packages/cli/dist/cli.js` contains bundled CLI entry point
- Build completes successfully
- No errors about missing dependencies
