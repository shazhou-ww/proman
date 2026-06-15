---
"@shazhou/proman-core": minor
"@shazhou/proman": minor
---

feat: add `cards validate`, `cards affected`, and `cards toc` subcommands

- `proman cards validate` — check frontmatter format (id, title, sources, tags)
- `proman cards affected --since <ref>` — find stale cards and uncovered files based on git changelog
- `proman cards toc` — output agent-friendly markdown table of all knowledge cards

Also fixes `parseFrontmatter` handling of empty inline arrays (`tags: []`).
