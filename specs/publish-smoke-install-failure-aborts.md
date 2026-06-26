---
scenario: "Abort smoke test when pnpm install --prod fails in extracted tarball"
feature: publish
tags: [smoke-test, dependencies, install, error-handling]
---

## Given
- A package has a `bin` entry and external dependencies, and NO `"smoke"` script
- During the tarball smoke test, `pnpm install --prod` in the extracted `package/`
  directory exits non-zero (e.g. an unresolvable dependency, registry/network error,
  or lockfile mismatch)

## When
- `proman publish` runs the smoke test phase for this package

## Then
- proman detects the non-zero exit of `pnpm install --prod`
- proman throws an error that aborts the smoke test; the message identifies the install
  step as the cause and includes its stderr/stdout output (consistent with existing
  `pnpm pack failed: ...` and `tar extract failed: ...` error patterns)
- The bin `node <bin-path> --version` step is NOT reached (no bin executed)
- The publish pipeline aborts before `npm publish` for this package — no publish,
  no git commit/tag/push
- The temp directory and the `.tgz` tarball are still cleaned up (cleanup runs in `finally`)
