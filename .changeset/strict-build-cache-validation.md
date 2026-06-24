---
"@shazhou/proman-core": patch
---

Strict build cache validation: verify all output artifacts exist before skipping rebuild.

- Fingerprint format upgraded from plain hash to JSON { hash, outputs }
- Added listOutputFiles() and isBuildCacheValid() for artifact completeness checks
- Fixes #211: single dist artifact missing no longer silently skipped
