---
scenario: "Publish skips already-published versions"
feature: publish
tags: [skip, idempotent]
---

## Given
- A package version is already on the npm registry

## When
- `proman publish` runs

## Then
- Already-published package is skipped with log `⏭ skipped @scope/pkg@version (already published)`
- Real errors (auth, network) still abort the pipeline
