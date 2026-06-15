---
scenario: "cards list outputs a summary of all indexed cards"
feature: cards
tags: [cards, list]
---

## Given
- `.cards-index.json` exists with `by_id` containing multiple cards:
  - `nerve-plugin-system`: title "Plugin 加载机制", tags `["architecture", "plugins"]`
  - `config-loading`: title "配置加载流程", tags `["config", "core"]`

## When
- Run `proman cards list`

## Then
- Reads `.cards-index.json` and outputs a summary table/list of all cards:
  ```
  nerve-plugin-system  Plugin 加载机制    [architecture, plugins]
  config-loading       配置加载流程       [config, core]
  ```
- Each line shows: id, title, tags
- Exit code 0
- If no cards exist in the index, outputs nothing and exits 0
- If `.cards-index.json` does not exist, exits with error and message suggesting to run `proman cards index` first
