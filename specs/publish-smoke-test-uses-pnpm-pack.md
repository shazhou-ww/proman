---
scenario: "Smoke test uses pnpm pack (not npm pack)"
feature: publish
tags: [smoke-test, pnpm, consistency]
---

## Given
- A package has a `bin` entry in package.json
- The project uses pnpm as the package manager

## When
- `proman publish` runs the smoke test

## Then
- The smoke test runs `pnpm pack` (not `npm pack`) to create the tarball
- Code comments accurately reference "pnpm pack"
- Error messages accurately reference "pnpm pack failed" (not "npm pack failed")
- All internal documentation and logs use "pnpm" consistently
