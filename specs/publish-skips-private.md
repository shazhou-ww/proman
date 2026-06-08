---
scenario: "Publish skips private packages"
feature: publish
tags: [private, skip]
---

## Given
- A package has `private: true` in proman.yaml or package.json

## When
- `proman publish` runs

## Then
- Private package is skipped with log `⏭ skipped @scope/pkg (private)`
- Other packages publish normally
