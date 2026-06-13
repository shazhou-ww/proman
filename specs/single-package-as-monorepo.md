---
scenario: "Single-package projects work as one-package monorepos"
feature: build
tags: [monorepo, unirepo, compatibility]
---

## Given
- A project has only one package in `packages/single-pkg/`
- `proman.yaml` lists only one package
- No special "unirepo" mode or flag is needed

## When
- Run any proman command:
  ```bash
  proman build
  proman test
  proman publish
  ```

## Then
- Command runs successfully on the single package
- No errors about "not a monorepo"
- No special handling or code path for single-package case
- Single-package projects are treated as monorepos with one entry
- This eliminates the need for separate unirepo support (issue #47)
