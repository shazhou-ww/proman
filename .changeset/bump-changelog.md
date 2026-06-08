---
"@shazhou/proman": patch
---

Move CHANGELOG generation and changeset file deletion from publish to bump

`proman bump` (changeset-infer mode) now generates per-package CHANGELOG.md
entries and deletes consumed `.changeset/*.md` files after bumping versions.
`proman publish` no longer touches changesets or changelogs — it only handles
build → test → npm publish → commit → tag → push.

This fixes the issue where publish would re-read already-consumed changesets,
causing duplicate processing and potential data staleness.
