---
scenario: "Bump consumes changesets and updates versions"
feature: bump
tags: [changeset, version]
---

## Given
- `.changeset/*.md` files exist with package bump declarations

## When
- `proman bump` runs

## Then
- Package versions in package.json are bumped according to changeset types (patch/minor/major)
- CHANGELOG.md is generated with changeset descriptions
- Consumed `.changeset/*.md` files are deleted
