---
scenario: "Fingerprint is content-based, not mtime-based"
feature: build
tags: [fingerprint, hashing]
---

## Given
- A source file is touched (mtime updated) without changing content

## When
- Fingerprint is recomputed

## Then
- Hash is identical to before the touch
- Build is correctly skipped
