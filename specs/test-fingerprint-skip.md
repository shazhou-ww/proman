---
scenario: "Test skips when source unchanged"
feature: test
tags: [fingerprint, skip]
---

## Given
- Tests previously passed
- `**/*.ts` and `package.json` are unchanged since last successful test

## When
- `proman test` runs (without `--force`)

## Then
- Test execution is skipped
- Logs `⏭ test (unchanged)`
