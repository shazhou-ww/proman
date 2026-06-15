---
"@shazhou/proman-core": minor
"@shazhou/proman": minor
---

feat: add `proman cards` subcommand family for project knowledge card index management

New commands:
- `proman cards index` — scan `cards/*.md`, parse frontmatter, generate `.cards-index.json`
- `proman cards query --sources <files...>` — find cards by source file references
- `proman cards query --tag <tag>` — filter cards by tag
- `proman cards query --id <id>` — get full card details by id
- `proman cards list` — list all indexed cards with id, title, tags
- `proman cards orphans` — find source files not referenced by any card

Index file structure: `by_source` (file → card ids) and `by_id` (id → title, sources, tags).
`.cards-index.json` is added to `.gitignore` as a build artifact.
