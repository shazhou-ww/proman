---
'@shazhou/proman-core': patch
'@shazhou/proman': patch
---

Fix build regression: cli type falls back to tsc when no build script

Since the monorepo refactor, `proman build` dispatched `pnpm run build`
for all `cli`-type packages. This broke consumers (ocas, uwf) whose cli
packages have no build script — they relied on proman's built-in
`tsc --build`.

Now cli-type packages check for a build script in package.json first.
If present, use `pnpm run build`; otherwise fall back to `tsc --build`
(same as lib/api types).
