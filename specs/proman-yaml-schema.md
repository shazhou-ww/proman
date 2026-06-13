---
scenario: "Root proman.yaml configures monorepo packages"
feature: init
tags: [config, monorepo, yaml]
---

## Given
- Proman monorepo has two packages: core and cli
- Root `proman.yaml` is created

## When
- Read `proman.yaml` content:
  ```yaml
  packages:
    - packages/core
    - packages/cli
  ```

## Then
- Config loader parses `packages` array
- Each entry is resolved to a package directory
- Package order determines build/test/publish order
- Config schema validates the structure (see `src/config/types.ts`)
- Invalid config produces clear error messages
