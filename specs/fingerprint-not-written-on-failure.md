---
scenario: "Build failure does not write fingerprint"
feature: build
tags: [fingerprint, error-handling]
---

## Given
- Package A has a compilation error

## When
- `proman build` runs

## Then
- No fingerprint files are written for any package
- Next run will attempt to build again
