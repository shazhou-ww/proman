#!/usr/bin/env bun
import { releaseCandidate } from './commands/release-candidate.ts'
import { releasePrepare } from './commands/release-prepare.ts'

const VERSION = '0.0.0'

export function parseReleasePrepareArgs(argv: string[]): { version: string; force: boolean } {
  let version: string | undefined
  let force = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--version') {
      const v = argv[i + 1]
      if (!v) throw new Error('--version requires a value')
      version = v
      i++
    } else if (a === '--force') {
      force = true
    } else {
      throw new Error(`unknown flag: ${a}`)
    }
  }
  if (!version) throw new Error('--version is required')
  return { version, force }
}

export function parseReleaseCandidateArgs(argv: string[]): Record<string, never> {
  for (const a of argv) {
    throw new Error(`unknown flag: ${a}`)
  }
  return {}
}

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0]
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION)
    return
  }
  if (cmd === 'release' && argv[1] === 'prepare') {
    const { version, force } = parseReleasePrepareArgs(argv.slice(2))
    await releasePrepare({ version, force })
    return
  }
  if (cmd === 'release' && argv[1] === 'candidate') {
    parseReleaseCandidateArgs(argv.slice(2))
    await releaseCandidate()
    return
  }
  console.log(`proman ${VERSION}`)
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err: Error) => {
    process.stderr.write(`${err.message}\n`)
    process.exit(1)
  })
}
