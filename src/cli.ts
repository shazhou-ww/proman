#!/usr/bin/env bun
import { build, check, format, runTests } from './commands/dev.ts'
import { releaseCandidate } from './commands/release-candidate.ts'
import { releaseFinalize } from './commands/release-finalize.ts'
import { releasePrepare } from './commands/release-prepare.ts'

const VERSION = '0.0.0'

const HELP_TEXT = `Usage: proman <command> [options]

Commands:
  release prepare       Prepare a release branch
  release candidate     Publish a release candidate
  release finalize      Finalize a release
  build                 Build each package (runs its build script in order)
  test                  Run tests (bun test or npm test based on runtime)
  check                 Lint with biome (bundled)
  format                Format with biome (bundled)

Options:
  -h, --help            Show this help
  -v, --version         Show version
`

export function parseReleasePrepareArgs(argv: string[]): {
  version: string | undefined
  force: boolean
  from: string | undefined
  patch: boolean
} {
  let version: string | undefined
  let force = false
  let from: string | undefined
  let patch = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--version') {
      const v = argv[i + 1]
      if (!v) throw new Error('--version requires a value')
      version = v
      i++
    } else if (a === '--from') {
      const v = argv[i + 1]
      if (!v) throw new Error('--from requires a value')
      from = v
      i++
    } else if (a === '--patch') {
      patch = true
    } else if (a === '--force') {
      force = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  return { version, force, from, patch }
}

export function parseReleaseCandidateArgs(argv: string[]): Record<string, never> {
  for (const a of argv) {
    throw new Error(`unknown flag: ${a}`)
  }
  return {}
}

export function parseReleaseFinalizeArgs(argv: string[]): { force: boolean } {
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
  if (cmd === 'release' && argv[1] === 'prepare') {
    const { version, force, from, patch } = parseReleasePrepareArgs(argv.slice(2))
    await releasePrepare({ version, force, from, patch })
    return
  }
  if (cmd === 'release' && argv[1] === 'candidate') {
    parseReleaseCandidateArgs(argv.slice(2))
    await releaseCandidate()
    return
  }
  if (cmd === 'release' && argv[1] === 'finalize') {
    const { force } = parseReleaseFinalizeArgs(argv.slice(2))
    await releaseFinalize({ force })
    return
  }
  if (cmd === 'build') {
    parseDevArgs(argv.slice(1))
    await build({ cwd: process.cwd() })
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
