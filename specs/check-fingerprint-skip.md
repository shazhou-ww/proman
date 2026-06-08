---
scenario: "Check skips when source unchanged"
feature: check
tags: [fingerprint, skip]
---

## Given
- Check previously passed
- No .ts files, package.json, or biome.json changed

## When
- `proman check` runs (without `--force`)

## Then
- Check execution is skipped
- Logs `⏭ check (unchanged)`
