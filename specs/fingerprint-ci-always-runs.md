---
scenario: "CI environment forces full rebuild"
feature: build
tags: [fingerprint, ci]
---

## Given
- All packages have matching fingerprints
- Environment variable `CI=true` or `CI=1` is set

## When
- `proman build` runs (without `--force`)

## Then
- All packages rebuild (CI implies force)
- Fingerprints are updated after successful build
