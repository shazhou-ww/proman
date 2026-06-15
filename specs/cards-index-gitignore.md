---
scenario: "cards index output file is gitignored"
feature: cards
tags: [cards, index, gitignore]
---

## Given
- A project using proman with a `.gitignore` file

## When
- Run `proman cards index`

## Then
- `.cards-index.json` is generated at project root
- The file `.cards-index.json` should be listed in `.gitignore` (either already present or the command ensures it)
- The index file is a build artifact, not committed to version control
