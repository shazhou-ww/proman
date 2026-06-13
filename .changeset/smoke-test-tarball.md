---
'@shazhou/proman': minor
---

Add smoke test for package tarballs before npm publish

Before publishing to npm, proman now validates that the packaged tarball actually works by:
- Running `npm pack` to create the tarball
- Extracting it to a temporary directory
- Executing `<bin> --version` for each bin entry
- Aborting publish if any bin command fails

This catches issues like missing files, broken imports, or incorrect package.json configuration before they reach npm, preventing broken releases.

Packages without bin entries skip the smoke test automatically.
