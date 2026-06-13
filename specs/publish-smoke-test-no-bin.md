---
scenario: "Skip smoke test for packages without bin entry"
feature: publish
tags: [npm, smoke-test, library]
---

## Given
- A package has no `bin` entry in package.json (pure library package)

## When
- `proman publish` runs for this package

## Then
- proman skips the tarball smoke test (no bin command to execute)
- Publishing proceeds normally with `npm publish`
- OR proman runs a minimal smoke test: `node -e "require('.')"` to verify the main entry point loads
