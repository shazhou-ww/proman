---
scenario: "Install production dependencies before running bin in tarball smoke test"
feature: publish
tags: [smoke-test, dependencies, pnpm, install, bin]
---

## Given
- A package has a `bin` entry in package.json (e.g. `"bin": {"uwf": "./dist/cli.js"}`)
- The package has external (registry) runtime dependencies, e.g.
  `"dependencies": { "@ocas/cli-kit": "^0.2.0", "zod": "^4.0.0", "yaml": "...", "liquidjs": "..." }`
- The package has NO `"smoke"` script, so the tarball fallback strategy is used
  (`smokeTestTarball`)
- The bin entrypoint imports those external packages at runtime
  (e.g. `import { ... } from '@ocas/cli-kit'`)

## When
- `proman publish` runs the smoke test phase for this package (smoke not skipped)

## Then
- proman runs `pnpm pack` and extracts the tarball into a temp `package/` directory
  (under `os.tmpdir()`, prefix `proman-smoke-`)
- **After extraction and before executing any bin**, proman runs `pnpm install --prod`
  in the extracted `package/` directory
- The command is exactly `pnpm install --prod` — pnpm (not `npm install`), and `--prod`
  so only `dependencies` are installed (devDependencies skipped)
- This populates `node_modules` in the extracted dir so external imports resolve at runtime
- proman then executes `node <bin-path> --version` for each bin entry, which now exits 0
- Before this fix the bin execution failed with
  `ERR_MODULE_NOT_FOUND: Cannot find package '@ocas/cli-kit' imported from .../package/dist/cli.js`
  because no dependencies were installed in the extracted dir
- The temp directory and the `.tgz` tarball are cleaned up afterward, even on failure
- In the unit test (mock `SpawnFn`), the recorded spawn calls include a `pnpm install --prod`
  invocation in the extracted `package/` directory, ordered before any `--version` call
