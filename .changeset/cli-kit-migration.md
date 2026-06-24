---
"@shazhou/proman": minor
---

Migrate CLI from manual arg parsing to @ocas/cli-kit framework.

- Use createCLI() command builder pattern (arg/flag/yields/returns/action)
- Zod schema validation for all command outputs
- Dual-layer output: stderr NDJSON yields + stdout structured returns
- Standard flags: --format yaml|json|text, --compact, --quiet, --json
- Structured error envelopes on failure
