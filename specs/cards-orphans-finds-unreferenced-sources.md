---
scenario: "cards orphans finds source files not referenced by any card"
feature: cards
tags: [cards, orphans, audit]
---

## Given
- `.cards-index.json` exists with `by_source` referencing:
  - `src/plugins/loader.ts`
  - `src/plugins/registry.ts`
  - `src/config/loader.ts`
- The project workspace contains additional source files:
  - `src/plugins/loader.ts` (referenced)
  - `src/plugins/registry.ts` (referenced)
  - `src/config/loader.ts` (referenced)
  - `src/utils/helpers.ts` (NOT referenced by any card)
  - `src/core/engine.ts` (NOT referenced by any card)

## When
- Run `proman cards orphans`

## Then
- Scans project source files (respecting package paths from proman.yaml or defaults to `src/`)
- Compares against all source paths in `.cards-index.json` `by_source` keys
- Outputs files not referenced by any card:
  ```
  src/utils/helpers.ts
  src/core/engine.ts
  ```
- Exit code 0
- If all source files are referenced, outputs nothing and exits 0
- If `.cards-index.json` does not exist, exits with error and message suggesting to run `proman cards index` first
