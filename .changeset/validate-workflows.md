---
"@shazhou/proman": minor
---

feat: validate workflow YAML in proman check

`proman check` now discovers `.workflows/*.yaml` and `.workflow/*.yaml` files
and validates each with `uwf workflow validate`. If uwf is not installed,
validation is skipped with a warning.
