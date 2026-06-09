---
scenario: "Check skips when source unchanged"
feature: check
tags: [fingerprint, skip]
---

## Given
- Check previously passed
- No .ts files changed (recursive `src/**/*.ts` match), package.json, or biome.json unchanged

## When
- `proman check` runs (without `--force`)

## Then
- Check execution is skipped
- Logs `⏭ check (unchanged)`
