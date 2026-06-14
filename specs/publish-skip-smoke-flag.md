---
scenario: "The --skip-smoke flag bypasses all smoke tests"
feature: publish
tags: [smoke-test, cli-flag, escape-hatch]
---

## Given
- One or more packages have smoke scripts or bin entries that would normally trigger smoke testing

## When
- `proman publish --skip-smoke` is invoked

## Then
- proman skips the smoke test phase entirely for ALL packages
- No `pnpm run smoke` is executed
- No tarball-based `node <bin> --version` is executed
- The rest of the publish pipeline proceeds normally (build → test → check → publish → commit → tag → push)
- The flag can be combined with other flags (e.g. `proman publish --skip-tests --skip-smoke`)
