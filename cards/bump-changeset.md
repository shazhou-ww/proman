---
id: bump-changeset
title: "Bump and Changeset Processing"
sources:
  - packages/core/src/commands/bump.ts
  - packages/core/src/utils/changeset.ts
  - packages/core/src/utils/version.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Bump and Changeset Processing

## Overview

The `bump` command handles version increments for monorepo packages. It supports two modes: explicit `--type` (bump all packages uniformly) and changeset-driven (per-package independent bumps inferred from `.changeset/` files). In changeset mode it also generates changelogs and cleans up consumed changeset files.

## Two Modes

### Explicit Mode (`--type major|minor|patch`)

Bumps **all** packages in the monorepo by the specified increment. No changelog generation. Simple and direct.

### Changeset Mode (no `--type`)

1. Reads all `.md` files from `.changeset/` directory
2. Infers per-package bump type (highest wins across all changesets)
3. Bumps only packages mentioned in changesets
4. Generates `CHANGELOG.md` entries per bumped package
5. Deletes consumed changeset files

## Changeset File Format

Files live in `.changeset/*.md` (excluding `README.md`). Each uses YAML frontmatter:

```markdown
---
"@shazhou/proman-core": minor
"@shazhou/proman": patch
---

Added new fingerprint caching for build command.
```

Frontmatter maps package names to bump types (`major`, `minor`, `patch`). The body becomes the changelog entry text.

## Parsing (`parseChangeset`)

- Extracts frontmatter between `---` delimiters
- Strips quotes from keys/values (supports both single and double quotes)
- Validates bump values against the set `{major, minor, patch}`
- Returns `{ file, packages, body }` typed as `Changeset`

## Bump Inference (`inferBump`)

When multiple changesets mention the same package with different bump types, the **highest severity wins**:

```typescript
const ORDER: Record<Bump, number> = { patch: 1, minor: 2, major: 3 }
```

Result: `Record<string, Bump>` — one entry per package that needs bumping.

## Version Arithmetic (`bumpVersion`)

Parses semver `major.minor.patch` (with optional pre-release suffix), then:
- `major` → `(major+1).0.0`
- `minor` → `major.(minor+1).0`
- `patch` → `major.minor.(patch+1)`

Pre-release suffixes (e.g., `-rc.1`) are stripped during bump — the result is always a clean release version.

## Changelog Generation

### Entry Format (`buildChangelogEntry`)

```markdown
## 1.2.0 — 2026-06-15

- First changeset body line
  continuation lines indented
- Second changeset body
```

### Prepend Strategy (`prependChangelog`)

- **No existing file** → creates `# Changelog\n\n<entry>`
- **Existing with heading** → inserts new entry after the `# Heading` line
- **Existing without heading** → prepends entry before all content

This ensures newest versions always appear at the top.

## Post-Bump Cleanup

In changeset mode, all consumed `.md` files are deleted via `unlink()`. This prevents the same changesets from being applied twice on the next run.

## Testability

- `now` option allows injecting a fixed date for deterministic output
- `cwd` option avoids `process.cwd()` coupling
- Pure functions (`bumpVersion`, `inferBump`, `parseChangeset`, `buildChangelogEntry`, `prependChangelog`) are all independently testable

## Relationship to Publish

The `bump` command handles version bumping and changelog generation. The `publish` command handles the actual release (build → test → publish → git). This separation (per issue #74) means `bump` can be run independently during development, and `publish` just reads the already-bumped versions from `package.json`.