---
scenario: "Dependency change cascades fingerprint invalidation"
feature: build
tags: [fingerprint, dependency, cascade]
---

## Given
- Package B depends on package A (in package.json dependencies)
- Package A source changes, package B source does not

## When
- `proman build` runs

## Then
- Both A and B rebuild (A's fingerprint change propagates to B)
- Unrelated package C is still skipped if unchanged
