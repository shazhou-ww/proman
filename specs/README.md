# Specs

Behavior specifications for proman commands, in Given/When/Then format.

## Convention

Each spec is a **snapshot of current implementation behavior**. When the implementation changes, the corresponding spec must be updated to match.

Specs are not aspirational — they describe what the code **does**, not what it should do.

## Frontmatter Schema

Every spec file has YAML frontmatter with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | string | One-line description of the behavior |
| `feature` | string | Which proman command (`build`, `test`, `check`, `publish`, `bump`, `format`) |
| `tags` | string[] | Categorization tags (e.g. `fingerprint`, `skip`, `cache`, `npm`) |

## File Naming

`<feature>-<behavior>.md` — e.g. `build-dispatches-per-package.md`, `test-fingerprint-skip.md`
