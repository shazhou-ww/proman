---
scenario: "Smoke test tarball before npm publish"
feature: publish
tags: [npm, smoke-test, tarball, validation]
---

## Given
- A package has a `bin` entry in package.json (e.g. `"bin": {"proman": "./dist/cli.js"}`)
- The package has been built and is ready for publishing

## When
- `proman publish` runs for this package

## Then
- Before `pnpm publish`, proman runs `pnpm pack` to create the tarball
- The tarball is extracted to a temporary directory
- For each `bin` entry, proman executes `node <bin-path> --version` in the extracted directory
- If the bin command exits with code 0, the smoke test passes
- The temporary directory is cleaned up
- Publishing proceeds to `npm publish`
