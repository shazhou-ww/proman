---
scenario: "CLI package parses args and delegates to core functions"
feature: build
tags: [cli, core, delegation]
---

## Given
- `packages/cli/` contains only arg parsing and CLI entry logic
- `packages/cli/` depends on `@shazhou/proman-core`
- CLI is built with esbuild to `packages/cli/dist/cli.js`

## When
- Run any proman command:
  ```bash
  proman build
  proman test
  proman publish
  ```

## Then
- CLI parses arguments and options
- CLI calls corresponding core function: `build()`, `test()`, `publish()`
- CLI handles stdout/stderr and exit codes
- CLI behavior is identical to pre-refactor version
- No breaking changes to the CLI interface
