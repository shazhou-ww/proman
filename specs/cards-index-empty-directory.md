---
scenario: "cards index handles missing or empty cards directory gracefully"
feature: cards
tags: [cards, index, edge-case]
---

## Given
- The project has no `cards/` directory, OR `cards/` exists but contains no `.md` files

## When
- Run `proman cards index`

## Then
- Generates `.cards-index.json` with empty structure:
  ```json
  {
    "by_source": {},
    "by_id": {}
  }
  ```
- Prints "Indexed 0 cards"
- Exit code 0 (not an error condition)
