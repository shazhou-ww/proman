#!/usr/bin/env node
import { build, check, format, runTests } from './commands/dev.ts'
import { deploy } from './commands/deploy.ts'
import { bump } from './commands/bump.ts'
import { publish } from './commands/publish.ts'

const VERSION = '0.3.0'

const HELP_TEXT = `Usage: proman <command> [options]

Commands:
  bump                  Bump package versions (from changesets or --type)
  publish               Build, test, publish, changelog, tag, push
  build                 Build each package by type (tsc/vite)
  deploy                Deploy webui/api packages (wrangler)
  test                  Run tests
  check                 Lint with biome (bundled)
  format                Format with biome (bundled)

Options:
  -h, --help            Show this help
  -v, --version         Show version
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
} {
  let skipTests = false
  for (const a of argv) {
    if (a === '--skip-tests') {
      skipTests = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { skipTests }
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

function parseDevArgs(argv: string[]): void {
  for (const a of argv) {
    throw new Error(`unknown flag: ${a}`)
  }
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0]
  if (cmd === undefined || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP_TEXT)
    return
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION)
    return
  }
  if (cmd === 'bump') {
    const { type } = parseBumpArgs(argv.slice(1))
    const version = await bump({ type })
    console.log(version)
    return
  }
  if (cmd === 'publish') {
    const { skipTests } = parsePublishArgs(argv.slice(1))
    await publish({ skipTests })
    return
  }
  if (cmd === 'build') {
    parseDevArgs(argv.slice(1))
    await build({ cwd: process.cwd() })
    return
  }
  if (cmd === 'deploy') {
    const { pkg, env } = parseDeployArgs(argv.slice(1))
    await deploy({ cwd: process.cwd(), pkg, env })
    return
  }
  if (cmd === 'test') {
    parseDevArgs(argv.slice(1))
    await runTests({ cwd: process.cwd() })
    return
  }
  if (cmd === 'check') {
    parseDevArgs(argv.slice(1))
    await check({ cwd: process.cwd() })
    return
  }
  if (cmd === 'format') {
    parseDevArgs(argv.slice(1))
    await format({ cwd: process.cwd() })
    return
  }
  throw new Error(`unknown command: ${cmd}`)
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err: Error) => {
    process.stderr.write(`${err.message}\n`)
    process.exit(1)
  })
}
