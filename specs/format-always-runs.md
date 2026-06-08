---
scenario: "Format always runs without fingerprint caching"
feature: format
tags: [biome, format]
---

## Given
- Source files exist

## When
- `proman format` runs

## Then
- Executes `pnpm exec biome format --write .`
- No `.proman/format/` directory is created
- No fingerprint caching (format mutates files, caching would be incorrect)
