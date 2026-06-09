---
'@shazhou/proman': patch
---

fix: move build fingerprints inside dist folder to fix cache invalidation

Build fingerprints are now stored inside each package's `dist/.build-fingerprint` instead of `.proman/build/`. This ensures that deleting the `dist/` folder automatically invalidates the build cache and forces a rebuild, fixing issue #135 where builds would be skipped even when `dist/` was deleted.

Breaking change: Old fingerprints in `.proman/build/` are ignored after this change. The first build after upgrading will rebuild all packages.
