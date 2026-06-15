---
scenario: "cards query --tag returns cards matching a given tag"
feature: cards
tags: [cards, query, tag]
---

## Given
- `.cards-index.json` exists with `by_id` containing:
  - `nerve-plugin-system`: tags `["architecture", "plugins"]`
  - `config-loading`: tags `["config", "core"]`
  - `event-system`: tags `["architecture", "events"]`

## When
- Run `proman cards query --tag architecture`

## Then
- Reads `.cards-index.json` and filters `by_id` entries where `tags` includes the given tag
- Outputs matching card IDs:
  ```
  nerve-plugin-system
  event-system
  ```
- Exit code 0
- If no cards match the tag, outputs nothing and exits 0
- If `.cards-index.json` does not exist, exits with error and message suggesting to run `proman cards index` first
