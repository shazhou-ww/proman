---
scenario: "Skip smoke test when package has neither smoke script nor bin"
feature: publish
tags: [smoke-test, skip, library]
---

## Given
- A package has NO `"smoke"` script in its package.json `scripts` field
- The package has NO `bin` entry in package.json (pure library)

## When
- `proman publish` runs the smoke test phase for this package

## Then
- proman skips the smoke test entirely (no tarball created, no command executed)
- Publishing proceeds directly to `npm publish`
- No warning or error is emitted
