---
id: cards-subsystem
title: "Cards Subsystem"
sources:
  - packages/core/src/commands/cards.ts
tags: [proman]
created: 2026-06-15
updated: 2026-06-15
---

# Cards Subsystem

## Overview

The cards subsystem provides a knowledge-card index for the project. It scans `cards/*.md` files, parses their frontmatter, builds a queryable index (`.cards-index.json`), and supports finding orphan source files not covered by any card.

## Commands

| Command | Purpose |
|---------|---------|
| `cards index` | Scan cards, build `.cards-index.json` |
| `cards query` | Query index by `--sources`, `--tag`, or `--id` |
| `cards list` | List all indexed cards (id, title, tags) |
| `cards orphans` | Find source files not referenced by any card |

## Index Schema (`.cards-index.json`)

```typescript
type CardsIndex = {
  by_source: Record<string, string[]>  // source path → card IDs
  by_id: Record<string, CardEntry>     // card ID → metadata
}

type CardEntry = {
  title: string
  sources: string[]
  tags: string[]
}
```

Two lookup maps enable bidirectional queries:
- **by_source** — "which cards cover this file?" (used by `--sources` query)
- **by_id** — "what does this card contain?" (used by `--id` query and `cards list`)

## Card Frontmatter Format

Cards are markdown files in `cards/` with YAML frontmatter:

```markdown
---
id: my-card-id
title: "Card Title"
sources:
  - packages/core/src/some-file.ts
  - packages/core/src/other-file.ts
tags: [architecture, config]
---
```

Required fields: `id` (used as the lookup key). Cards without `id` are silently skipped during indexing.

## Frontmatter Parser

A custom lightweight parser (`parseFrontmatter`) handles:
- Key-value pairs: `key: value`
- Multi-line YAML arrays (indented `- item`)
- Inline arrays: `key: [item1, item2]`

No external YAML dependency — the parser is self-contained (the `yaml` package is used elsewhere but not here).

## Query Modes

### By sources (`--sources <files...>`)
Returns card IDs covering any of the given source files. Uses `by_source` map.

### By tag (`--tag <tag>`)
Iterates `by_id`, returns IDs where `entry.tags.includes(tag)`.

### By ID (`--id <id>`)
Returns full `CardDetail` (id, title, sources, tags). Throws if not found.

## Orphans Detection

`cardsOrphans` finds source files with no card coverage:

1. Collects all source files matching `.(ts|tsx|js|jsx|mts|cts)` under given `srcPaths`
2. Builds a set of all sources referenced in the index (`by_source` keys)
3. Returns files present on disk but absent from the index

This helps identify areas of the codebase lacking documentation.

## Design Notes

- **Index is pre-built** — `query`, `list`, and `orphans` all require `.cards-index.json` to exist (throws with a helpful message if missing). The index must be regenerated after adding/changing cards.
- **No hot reload** — the index is a static JSON file, not a live database.
- **Filesystem-based** — no database, no server. Cards are just markdown files; the index is derivable from them at any time.
- **Async interface** — all command functions return `Promise` even though current implementation is synchronous (allows future async evolution without API breaks).
