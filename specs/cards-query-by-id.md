---
scenario: "cards query --id returns full details of a card by its id"
feature: cards
tags: [cards, query, id]
---

## Given
- `.cards-index.json` exists with `by_id` containing:
  - `nerve-plugin-system`: `{ title: "Plugin 加载机制", sources: ["src/plugins/loader.ts", "src/plugins/registry.ts"], tags: ["architecture", "plugins"] }`

## When
- Run `proman cards query --id nerve-plugin-system`

## Then
- Reads `.cards-index.json` and looks up the id in `by_id`
- Outputs the card details as JSON:
  ```json
  {
    "id": "nerve-plugin-system",
    "title": "Plugin 加载机制",
    "sources": ["src/plugins/loader.ts", "src/plugins/registry.ts"],
    "tags": ["architecture", "plugins"]
  }
  ```
- Exit code 0
- If the id is not found, exits with non-zero code and error message "Card not found: <id>"
- If `.cards-index.json` does not exist, exits with error and message suggesting to run `proman cards index` first
