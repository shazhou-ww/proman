---
scenario: "Test failure does not cache fingerprint"
feature: test
tags: [fingerprint, error-handling]
---

## Given
- Tests fail (non-zero exit)

## When
- `proman test` runs

## Then
- Fingerprint is NOT written
- Next run will re-execute tests
