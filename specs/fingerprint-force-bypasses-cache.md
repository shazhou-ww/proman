---
scenario: "Force flag bypasses fingerprint cache"
feature: build
tags: [fingerprint, force]
---

## Given
- All packages have matching fingerprints (nothing changed)

## When
- `proman build --force` runs

## Then
- All packages rebuild regardless of cache
- Fingerprints are updated after successful build
