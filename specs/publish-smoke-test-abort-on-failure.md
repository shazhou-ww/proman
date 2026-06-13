---
scenario: "Abort publish when smoke test fails"
feature: publish
tags: [npm, smoke-test, validation, error-handling]
---

## Given
- A package has a `bin` entry in package.json
- The package references non-JS resource files not included in the tarball (e.g. `files` field missing required assets)
- OR the package has broken imports/missing dependencies

## When
- `proman publish` runs and the smoke test executes `node <bin-path> --version`

## Then
- The bin command exits non-zero or throws an error (e.g. `ENOENT: no such file or directory`)
- proman logs the smoke test failure with the error output
- proman aborts the publish pipeline before `npm publish`
- The temporary directory is cleaned up
- Exit code is non-zero
- No git commit/tag/push occurs
