---
scenario: "CI workflow uses action sources reachable from self-hosted runner"
feature: cards
tags: [ci, gitea, actions]
---

## Given
- CI runs on a self-hosted Gitea runner (`tuanzi-runner`) that cannot reliably reach `github.com` (TLS handshake timeouts)
- `.gitea/workflows/ci.yml` defines the CI pipeline
- Gitea provides compatible action mirrors at `https://gitea.com/actions/`

## When
- A PR is pushed and CI triggers

## Then
- CI uses action sources that the self-hosted runner can reach
- `actions/checkout@v4` is replaced with `https://gitea.com/actions/checkout@v4`
- `actions/setup-node@v4` is replaced with `https://gitea.com/actions/setup-node@v4`
- All CI steps (build, check, test) execute successfully without network timeouts
