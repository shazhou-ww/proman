---
scenario: "cards index scans cards/*.md and generates .cards-index.json"
feature: cards
tags: [cards, index, frontmatter]
---

## Given
- A project with `cards/` directory containing markdown files with YAML frontmatter
- Example card `cards/plugin-system.md`:
  ```yaml
  ---
  id: nerve-plugin-system
  title: Plugin 加载机制
  sources:
    - src/plugins/loader.ts
    - src/plugins/registry.ts
  tags: [architecture, plugins]
  ---
  ```
- Another card `cards/config-loading.md`:
  ```yaml
  ---
  id: config-loading
  title: 配置加载流程
  sources:
    - src/config/loader.ts
  tags: [config, core]
  ---
  ```

## When
- Run `proman cards index`

## Then
- Scans all `cards/*.md` files and parses their YAML frontmatter
- Generates `.cards-index.json` at project root with structure:
  ```json
  {
    "by_source": {
      "src/plugins/loader.ts": ["nerve-plugin-system"],
      "src/plugins/registry.ts": ["nerve-plugin-system"],
      "src/config/loader.ts": ["config-loading"]
    },
    "by_id": {
      "nerve-plugin-system": {
        "title": "Plugin 加载机制",
        "sources": ["src/plugins/loader.ts", "src/plugins/registry.ts"],
        "tags": ["architecture", "plugins"]
      },
      "config-loading": {
        "title": "配置加载流程",
        "sources": ["src/config/loader.ts"],
        "tags": ["config", "core"]
      }
    }
  }
  ```
- Exit code 0 on success
- Prints count of indexed cards to stdout (e.g. "Indexed 2 cards")
