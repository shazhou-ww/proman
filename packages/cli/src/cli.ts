#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCLI } from '@ocas/cli-kit'
import {
  build,
  bump,
  cardsAffected,
  cardsIndex,
  cardsList,
  cardsOrphans,
  cardsQuery,
  cardsToc,
  cardsValidate,
  check,
  deploy,
  format,
  init,
  link,
  linkStatus,
  publish,
  runTests,
  unlink,
} from '@shazhou/proman-core'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}
const VERSION = pkg.version

// --- Early: --version / -v (only first positional arg, not subcommand flags) ---

const firstToken = process.argv[2]
if (firstToken === '--version' || firstToken === '-v') {
  process.stdout.write(`${VERSION}\n`)
  process.exit(0)
}

// --- Early: --help / -h / no args ---

const HELP_TEXT = `Usage: proman <command> [options]

Commands:
  init [dir]            Scaffold a new monorepo (default: current directory)
  bump                  Bump package versions (from changesets or --type)
  publish               Build, test, publish, changelog, tag, push
  build                 Build each package by type (tsc/vite)
  deploy                Deploy webui/api packages (wrangler)
  test                  Run tests
  check                 Lint with biome + validate .workflows/ YAML
  format                Format with biome
  link [package]        Link local package for development
  unlink [package]      Unlink and restore packages from registry
  cards <sub>           Knowledge cards: index, query, list, orphans, validate, affected, toc
  prompt <sub>          prompt usage | prompt setup

Standard flags (--format yaml|json|text, --compact, --quiet, --json):
  --format <fmt>     Output format (default: yaml)
  --compact          Compact output
  --quiet            Suppress stderr yields
  --json             Shorthand for --format json --compact

Options:
  -h, --help         Show this help
  -v, --version      Show version
  --force            Force run build/test/check (skip fingerprint cache)
`

const argv = process.argv.slice(2)
const firstArg = argv[0]
if (firstArg === undefined || firstArg === '--help' || firstArg === '-h') {
  process.stdout.write(HELP_TEXT)
  process.exit(0)
}

// --- Schemas ---

const okSchema = z.object({ ok: z.boolean() })

const versionBumpSchema = z.object({
  packages: z.record(z.string(), z.string()),
})

const cardsIndexSchema = z.object({
  count: z.number(),
})

const cardSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()),
})

const cardDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  sources: z.array(z.string()),
  tags: z.array(z.string()),
})

const cardsQueryResultSchema = z.object({
  result: z.union([z.array(z.string()), cardDetailSchema, z.null()]),
})

const cardsTocSchema = z.object({
  toc: z.string(),
})

const cardsValidateSchema = z.object({
  errors: z.array(
    z.object({
      file: z.string(),
      errors: z.array(z.string()),
    }),
  ),
})

const staleCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  commits: z.number(),
  files: z.array(z.string()),
})

const uncoveredFileSchema = z.object({
  file: z.string(),
  commits: z.number(),
})

const cardsAffectedSchema = z.object({
  stale: z.array(staleCardSchema),
  uncovered: z.array(uncoveredFileSchema),
})

const linkStatusSchema = z.object({
  message: z.string(),
})

// --- Build CLI ---

const cli = createCLI({
  name: 'proman',
  version: VERSION,
})

// init [dir]
cli
  .command('init')
  .arg('dir')
  .returns(okSchema, '')
  .action(async (args) => {
    const targetDir = args.dir ?? process.cwd()
    await init({ targetDir })
    return undefined
  })

// bump [--type <major|minor|patch>]
cli
  .command('bump')
  .flag('type', { type: 'string' })
  .returns(versionBumpSchema, '{{ packages }}')
  .action(async (_args, flags) => {
    const rawType = flags.type as string | undefined
    let type: 'major' | 'minor' | 'patch' | undefined
    if (rawType !== undefined) {
      if (rawType !== 'major' && rawType !== 'minor' && rawType !== 'patch') {
        throw new Error('--type must be major, minor, or patch')
      }
      type = rawType
    }
    const bumped = await bump({ type })
    return { packages: bumped }
  })

// publish [--skip-tests] [--skip-smoke]
cli
  .command('publish')
  .flag('skip-tests', { type: 'boolean' })
  .flag('skip-smoke', { type: 'boolean' })
  .returns(okSchema, '')
  .action(async (_args, flags) => {
    await publish({
      skipTests: Boolean(flags['skip-tests']),
      skipSmoke: Boolean(flags['skip-smoke']),
    })
    return undefined
  })

// build [--force]
cli
  .command('build')
  .flag('force', { type: 'boolean' })
  .returns(okSchema, '')
  .action(async (_args, flags) => {
    const isCI = process.env.CI === 'true' || process.env.CI === '1'
    await build({ cwd: process.cwd(), force: isCI || Boolean(flags.force) })
    return undefined
  })

// deploy [--package <name>] [--env <env>]
cli
  .command('deploy')
  .flag('package', { type: 'string' })
  .flag('env', { type: 'string' })
  .returns(okSchema, '')
  .action(async (_args, flags) => {
    await deploy({
      cwd: process.cwd(),
      ...(typeof flags.package === 'string' ? { pkg: flags.package } : {}),
      ...(typeof flags.env === 'string' ? { env: flags.env } : {}),
    })
    return undefined
  })

// test [--force] [--concurrency <n>]
cli
  .command('test')
  .flag('force', { type: 'boolean' })
  .flag('concurrency', { type: 'string' })
  .returns(okSchema, '')
  .action(async (_args, flags) => {
    const isCI = process.env.CI === 'true' || process.env.CI === '1'
    const concurrency = flags.concurrency ? Number(flags.concurrency) : undefined
    await runTests({ cwd: process.cwd(), force: isCI || Boolean(flags.force), concurrency })
    return undefined
  })

// check [--force]
cli
  .command('check')
  .flag('force', { type: 'boolean' })
  .returns(okSchema, '')
  .action(async (_args, flags) => {
    const isCI = process.env.CI === 'true' || process.env.CI === '1'
    await check({ cwd: process.cwd(), force: isCI || Boolean(flags.force) })
    return undefined
  })

// format
cli
  .command('format')
  .returns(okSchema, '')
  .action(async () => {
    await format({ cwd: process.cwd() })
    return undefined
  })

// link [package] [--status]
cli
  .command('link')
  .arg('package')
  .flag('status', { type: 'boolean' })
  .returns(linkStatusSchema, '{{ message }}')
  .action(async (args, flags) => {
    if (flags.status) {
      const message = await linkStatus({ cwd: process.cwd() })
      return { message }
    }
    const packageName = args.package ?? undefined
    await link({ cwd: process.cwd(), packageName })
    return undefined
  })

// unlink [package]
cli
  .command('unlink')
  .arg('package')
  .returns(okSchema, '')
  .action(async (args) => {
    const packageName = args.package ?? undefined
    await unlink({ cwd: process.cwd(), packageName })
    return undefined
  })

// cards index
cli
  .command('cards')
  .command('index')
  .returns(cardsIndexSchema, 'Indexed {{ count }} cards')
  .action(async () => {
    const result = await cardsIndex({ cwd: process.cwd() })
    return { count: result.count }
  })

// cards query — sources via positional args after --sources
cli
  .command('cards')
  .command('query')
  .flag('sources', { type: 'string' })
  .flag('tag', { type: 'string' })
  .flag('id', { type: 'string' })
  .returns(cardsQueryResultSchema, '{{ result }}')
  .action(async (_args, flags) => {
    const positionals = (flags as unknown as { _positionals?: string[] })._positionals ?? []
    const sourcesFlag = typeof flags.sources === 'string' ? [flags.sources] : []
    const sources = [...sourcesFlag, ...positionals]
    const sourcesArg = sources.length > 0 ? sources : undefined
    const tag = typeof flags.tag === 'string' ? flags.tag : undefined
    const id = typeof flags.id === 'string' ? flags.id : undefined
    if (!sourcesArg && !tag && !id) {
      throw new Error('cards query requires --sources, --tag, or --id')
    }
    const result = await cardsQuery({ cwd: process.cwd(), sources: sourcesArg, tag, id })
    return { result: result ?? null }
  })

// cards list
cli
  .command('cards')
  .command('list')
  .yields(cardSummarySchema, '{{ id }}\t{{ title }}\t[{{ tags }}]')
  .returns(okSchema, '')
  .action(async function* () {
    const result = await cardsList({ cwd: process.cwd() })
    for (const card of result) {
      yield card
    }
    return undefined
  })

// cards orphans
cli
  .command('cards')
  .command('orphans')
  .yields(z.object({ file: z.string() }), '{{ file }}')
  .returns(okSchema, '')
  .action(async function* () {
    const result = await cardsOrphans({ cwd: process.cwd(), srcPaths: ['src/'] })
    for (const file of result) {
      yield { file }
    }
    return undefined
  })

// cards validate
cli
  .command('cards')
  .command('validate')
  .returns(cardsValidateSchema, '')
  .action(async () => {
    const errors = await cardsValidate({ cwd: process.cwd() })
    if (errors.length > 0) {
      process.exitCode = 1
    }
    return { errors }
  })

// cards affected [--since <ref>]
cli
  .command('cards')
  .command('affected')
  .flag('since', { type: 'string' })
  .returns(cardsAffectedSchema, '')
  .action(async (_args, flags) => {
    const since = typeof flags.since === 'string' ? flags.since : undefined
    const result = await cardsAffected({ cwd: process.cwd(), since })
    return result
  })

// cards toc
cli
  .command('cards')
  .command('toc')
  .returns(cardsTocSchema, '{{ toc }}')
  .action(async () => {
    const toc = await cardsToc({ cwd: process.cwd() })
    return { toc }
  })

// prompt usage
cli
  .command('prompt')
  .command('usage')
  .returns(z.object({ content: z.string() }), '{{ content }}')
  .action(async () => {
    const content = readFileSync(join(__dirname, '..', 'prompts', 'usage.md'), 'utf-8')
    return { content }
  })

// prompt setup
cli
  .command('prompt')
  .command('setup')
  .returns(z.object({ content: z.string() }), '{{ content }}')
  .action(async () => {
    const content = readFileSync(join(__dirname, '..', 'prompts', 'setup.md'), 'utf-8')
    return { content }
  })

// --- Run ---

const exitCode = await cli.run()
if (exitCode !== 0) {
  process.exit(exitCode)
}
