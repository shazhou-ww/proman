#!/usr/bin/env node
import { build, check, format, runTests } from './commands/dev.ts'
import { deploy } from './commands/deploy.ts'
import { release } from './commands/release.ts'

const VERSION = '0.3.0'

const HELP_TEXT = `Usage: proman <command> [options]

Commands:
  release               Publish a release (bump, build, test, publish, tag)
  build                 Build each package by type (tsc/vite)
  deploy                Deploy webui/api packages (wrangler)
  test                  Run tests
  check                 Lint with biome (bundled)
  format                Format with biome (bundled)

Options:
  -h, --help            Show this help
  -v, --version         Show version
`

export function parseReleaseArgs(argv: string[]): {
  version: string | undefined
  bump: 'major' | 'minor' | 'patch' | undefined
  force: boolean
  skipTests: boolean
} {
  let version: string | undefined
  let bump: 'major' | 'minor' | 'patch' | undefined
  let force = false
  let skipTests = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--version') {
      const v = argv[i + 1]
      if (!v) throw new Error('--version requires a value')
      version = v
      i++
    } else if (a === '--bump') {
      const v = argv[i + 1]
      if (v !== 'major' && v !== 'minor' && v !== 'patch') {
        throw new Error('--bump must be major, minor, or patch')
      }
      bump = v
      i++
    } else if (a === '--force') {
      force = true
    } else if (a === '--skip-tests') {
      skipTests = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  if (version && bump) {
    throw new Error('--version and --bump are mutually exclusive')
  }
  return { version, bump, force, skipTests }
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
  if (cmd === 'release') {
    const { version, bump, force, skipTests } = parseReleaseArgs(argv.slice(1))
    await release({ version, bump, force, skipTests })
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
