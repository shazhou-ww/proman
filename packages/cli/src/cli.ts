#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  build,
  bump,
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}
const VERSION = pkg.version

const HELP_TEXT = `Usage: proman <command> [options]

Commands:
  init [dir]            Scaffold a new monorepo (default: current directory)
  bump                  Bump package versions (from changesets or --type)
  publish               Build, test, publish, changelog, tag, push
                          --skip-tests  Skip test step
                          --skip-smoke  Skip smoke test step
  build                 Build each package by type (tsc/vite)
  deploy                Deploy webui/api packages (wrangler)
                          --package <name>  Deploy a single package
                          --env <env>       Wrangler environment (e.g. staging)
  test                  Run tests
  check                 Lint with biome + validate .workflows/ YAML
  format                Format with biome
  link [package]        Link local package for development
                          (no args)         Link current package globally
                          <package>         Link package from global registry
                          --status          Show linked packages
  unlink [package]      Unlink and restore packages from registry
                          (no args)         Unlink all linked packages
                          <package>         Unlink specific package
  prompt setup          Show skill installation instructions (for agents)
  prompt usage          Show full CLI usage as markdown (for agents)

Options:
  -h, --help            Show this help
  -v, --version         Show version
  --force               Force run build/test/check (skip fingerprint cache)
`

export function parseBumpArgs(argv: string[]): {
  type: 'major' | 'minor' | 'patch' | undefined
} {
  let type: 'major' | 'minor' | 'patch' | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--type') {
      const v = argv[i + 1]
      if (v !== 'major' && v !== 'minor' && v !== 'patch') {
        throw new Error('--type must be major, minor, or patch')
      }
      type = v
      i++
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { type }
}

export function parsePublishArgs(argv: string[]): {
  skipTests: boolean
  skipSmoke: boolean
} {
  let skipTests = false
  let skipSmoke = false
  for (const a of argv) {
    if (a === '--skip-tests') {
      skipTests = true
    } else if (a === '--skip-smoke') {
      skipSmoke = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { skipTests, skipSmoke }
}

export function parseDeployArgs(argv: string[]): { pkg?: string; env?: string } {
  let pkg: string | undefined
  let env: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--package') {
      const v = argv[i + 1]
      if (v === undefined) throw new Error('--package requires a value')
      pkg = v
      i++
    } else if (a === '--env') {
      const v = argv[i + 1]
      if (v === undefined) throw new Error('--env requires a value')
      env = v
      i++
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { pkg, env }
}

export function parseDevArgs(argv: string[]): { force: boolean } {
  let force = false
  for (const a of argv) {
    if (a === '--force') {
      force = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { force }
}

export function parseLinkArgs(argv: string[]): {
  packageName?: string
  status: boolean
} {
  let packageName: string | undefined
  let status = false
  for (const a of argv) {
    if (a === '--status') {
      status = true
    } else if (!a.startsWith('-')) {
      packageName = a
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { packageName, status }
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0]
  const isCI = process.env.CI === 'true' || process.env.CI === '1'
  if (cmd === undefined || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP_TEXT)
    return
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION)
    return
  }
  if (cmd === 'init') {
    const targetDir = argv[1] ?? process.cwd()
    await init({ targetDir })
    return
  }
  if (cmd === 'bump') {
    const { type } = parseBumpArgs(argv.slice(1))
    const bumped = await bump({ type })
    for (const [name, version] of Object.entries(bumped)) {
      console.log(`${name}@${version}`)
    }
    return
  }
  if (cmd === 'publish') {
    const { skipTests, skipSmoke } = parsePublishArgs(argv.slice(1))
    await publish({ skipTests, skipSmoke })
    return
  }
  if (cmd === 'build') {
    const { force } = parseDevArgs(argv.slice(1))
    await build({ cwd: process.cwd(), force: isCI || force })
    return
  }
  if (cmd === 'deploy') {
    const { pkg, env } = parseDeployArgs(argv.slice(1))
    await deploy({ cwd: process.cwd(), pkg, env })
    return
  }
  if (cmd === 'test') {
    const { force } = parseDevArgs(argv.slice(1))
    await runTests({ cwd: process.cwd(), force: isCI || force })
    return
  }
  if (cmd === 'check') {
    const { force } = parseDevArgs(argv.slice(1))
    await check({ cwd: process.cwd(), force: isCI || force })
    return
  }
  if (cmd === 'format') {
    parseDevArgs(argv.slice(1))
    await format({ cwd: process.cwd() })
    return
  }
  if (cmd === 'link') {
    const { packageName, status } = parseLinkArgs(argv.slice(1))
    if (status) {
      const result = await linkStatus({ cwd: process.cwd() })
      console.log(result)
    } else {
      await link({ cwd: process.cwd(), packageName })
    }
    return
  }
  if (cmd === 'unlink') {
    const { packageName } = parseLinkArgs(argv.slice(1))
    await unlink({ cwd: process.cwd(), packageName })
    return
  }
  if (cmd === 'prompt') {
    const sub = argv[1]
    if (sub === 'usage') {
      process.stdout.write(readFileSync(join(__dirname, '..', 'prompts', 'usage.md'), 'utf-8'))
      return
    }
    if (sub === 'setup') {
      process.stdout.write(readFileSync(join(__dirname, '..', 'prompts', 'setup.md'), 'utf-8'))
      return
    }
    throw new Error(`Unknown prompt subcommand: ${sub ?? '(none)'}. Available: usage, setup`)
  }
  throw new Error(`unknown command: ${cmd}`)
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err: Error) => {
    process.stderr.write(`${err.message}\n`)
    process.exit(1)
  })
}
