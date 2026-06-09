---
scenario: "Check skips when source unchanged"
feature: check
tags: [fingerprint, skip]
---

## Given
- Check previously passed
- `**/*.ts`, `package.json`, and `biome.json` are unchanged since last successful check

## When
- `proman check` runs (without `--force`)

## Then
- Check execution is skipped
- Logs `⏭ check (unchanged)`
