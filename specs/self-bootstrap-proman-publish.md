---
scenario: "Proman publishes itself using proman publish command"
feature: publish
tags: [dogfooding, monorepo, self-bootstrap, npm]
---

## Given
- `proman.yaml` exists at repo root
- Both packages are built
- Version bump has been performed
- User is authenticated to npm

## When
- Run publish command:
  ```bash
  proman publish
  ```

## Then
- Core package is published first to npm as `@shazhou/proman-core`
- CLI package is published after core to npm as `@shazhou/proman`
- Publish order respects dependency (cli depends on core)
- Both packages have matching versions
- Publication completes successfully
