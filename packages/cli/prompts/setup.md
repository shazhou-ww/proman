# proman Skill Setup

You are being asked to install or update the proman skill
so that you know how to use the `proman` CLI.

## Steps

1. **Check if proman CLI is installed:**
   ```bash
   proman --help
   ```
   If not installed: `pnpm add -g @shazhou/proman`

2. **Clean up old versions of the skill** (if any exist):
   - Look for any existing proman skill files in your skill directories
     (e.g. `~/.hermes/skills/proman/SKILL.md` or similar paths).
   - If a skill exists, read its `version` from the YAML frontmatter.
   - If the version matches the current CLI version (`proman --version`), you're done — no update needed.
   - If the version is older, **delete the old skill file** before proceeding.

3. **Get the usage skill content:**
   ```bash
   proman prompt usage
   ```

4. **Create a SKILL.md file** in your skill directory (e.g. `~/.hermes/skills/proman/SKILL.md`).
   The output of `proman prompt usage` is the skill body WITHOUT frontmatter.
   You must prepend the following YAML frontmatter:

   ```yaml
   ---
   name: proman
   description: "Shazhou team pnpm monorepo dev scaffold — build, test, lint, bump, publish, and deploy in one CLI."
   version: <VERSION>
   author: Shazhou
   license: MIT
   metadata:
     hermes:
       tags: [monorepo, pnpm, dev-tooling, shazhou, cli]
   ---
   ```

   Replace `<VERSION>` with the installed CLI version (from `proman --version`).

5. **Verify** the skill is loadable by your agent framework.

## Notes

- The skill content is bundled with the CLI and versioned with it — always use
  `proman prompt usage` to get the content matching your installed version.
- Do NOT hand-edit the skill body. If the CLI is updated, re-run `proman prompt setup`
  and follow the steps again.
- When upgrading, always delete the old skill first to avoid stale instructions.
