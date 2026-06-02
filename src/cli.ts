#!/usr/bin/env bun
const VERSION = '0.0.0'

function main(argv: string[]): void {
  const cmd = argv[0]
  if (cmd === '--version' || cmd === '-v') {
    console.log(VERSION)
    return
  }
  console.log(`proman ${VERSION}`)
}

main(process.argv.slice(2))
