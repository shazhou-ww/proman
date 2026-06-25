---
"@shazhou/proman-core": patch
"@shazhou/proman": patch
---

Fix `proman publish` aborting before the git tag step when the working tree is already clean.

In the uwf split-role release workflow the `bumper` role commits + merges the version bump via a release PR *before* `publish` runs, so the working tree is clean by the time `publish` reaches its release-commit step. The old code unconditionally ran `git commit -m "release: v<X>"`, which failed with "nothing to commit" and aborted the whole command — *after* the irreversible `npm publish` had already succeeded but *before* `git tag`/`push`, leaving published packages without a git tag.

`publish` now guards the release commit on `git.isCleanTree()`: when the tree is clean it skips the commit (printing `⏭ skipped release commit …`) and proceeds straight to tagging and pushing; when the tree is dirty (e.g. a standalone `proman publish` that also bumped) it commits as before. Tags and push always run regardless.
