---
scenario: "Test skips when source unchanged"
feature: test
tags: [fingerprint, skip]
---

## Given
- Tests previously passed
- No .ts files changed (recursive `**/*.ts` match) or package.json unchanged

## When
- `proman test` runs (without `--force`)

## Then
- Test execution is skipped
- Logs `⏭ test (unchanged)`
