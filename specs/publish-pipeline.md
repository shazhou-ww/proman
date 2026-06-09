---
scenario: "Publish runs full release pipeline"
feature: publish
tags: [release, npm, git]
---

## Given
- Packages have been bumped to new versions

## When
- `proman publish` runs

## Then
- Pipeline executes in order: install → build → test → check → npm publish → git commit → git tag → git push
- Each package is published with `pnpm publish --no-git-checks`
- Versions matching `-rc.\d+` are published with `--tag rc` instead of `--tag latest`
- Git tags follow `@scope/name@vX.Y.Z` format
