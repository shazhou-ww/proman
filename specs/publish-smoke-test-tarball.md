---
scenario: "Smoke test tarball before npm publish (fallback when no smoke script)"
feature: publish
tags: [npm, smoke-test, tarball, validation, fallback]
---

## Given
- A package has a `bin` entry in package.json (e.g. `"bin": {"proman": "./dist/cli.js"}`)
- The package has NO `"smoke"` script in its package.json `scripts` field
- The package has been built and is ready for publishing

## When
- `proman publish` runs for this package

## Then
- Before `pnpm publish`, proman runs `pnpm pack` to create the tarball
- The tarball is extracted to a temporary directory (`package/` subdir)
- Workspace dependencies (if any) are symlinked into the extracted `node_modules`
- proman runs `pnpm install --prod` in the extracted `package/` directory to install
  external runtime dependencies before executing the bin
- For each `bin` entry, proman executes `node <bin-path> --version` in the extracted directory
- If the bin command exits with code 0, the smoke test passes
- The temporary directory and the tarball are cleaned up
- Publishing proceeds to `npm publish`
