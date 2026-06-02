import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type Bump = 'major' | 'minor' | 'patch'

export type Changeset = {
  file: string
  packages: Record<string, Bump>
  body: string
}

const VALID_BUMPS: ReadonlySet<string> = new Set(['major', 'minor', 'patch'])

function stripQuotes(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1)
  }
  return t
}

export function parseChangeset(raw: string, file: string): Changeset {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!fmMatch) {
    throw new Error(`missing frontmatter in changeset: ${file}`)
  }
  const fmBlock = fmMatch[1] as string
  const body = (fmMatch[2] as string).replace(/^\s+|\s+$/g, '')
  const packages: Record<string, Bump> = {}
  const lines = fmBlock.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) {
      throw new Error(`invalid frontmatter line in ${file}: ${line}`)
    }
    const key = stripQuotes(trimmed.slice(0, colonIdx))
    const value = stripQuotes(trimmed.slice(colonIdx + 1))
    if (!VALID_BUMPS.has(value)) {
      throw new Error(`invalid bump '${value}' for package '${key}' in ${file}`)
    }
    packages[key] = value as Bump
  }
  return { file, packages, body }
}

export async function readChangesets(rootDir: string): Promise<Changeset[]> {
  const dir = join(rootDir, '.changeset')
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const mdFiles = entries.filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md').sort()
  const out: Changeset[] = []
  for (const name of mdFiles) {
    const file = join(dir, name)
    const raw = await readFile(file, 'utf8')
    out.push(parseChangeset(raw, file))
  }
  return out
}

export type ChangelogEntryInput = {
  version: string
  date: string
  bodies: string[]
}

export function buildChangelogEntry(input: ChangelogEntryInput): string {
  const { version, date, bodies } = input
  const lines: string[] = [`## ${version} — ${date}`, '']
  for (const body of bodies) {
    const parts = body.split(/\r?\n/)
    const first = parts[0] ?? ''
    lines.push(`- ${first}`)
    for (let i = 1; i < parts.length; i++) {
      lines.push(`  ${parts[i]}`)
    }
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

export function prependChangelog(existing: string | null, entry: string): string {
  if (!existing || existing.trim() === '') {
    return `# Changelog\n\n${entry}`
  }
  const headingMatch = existing.match(/^(#\s+[^\n]*\n)(\n*)([\s\S]*)$/)
  if (headingMatch) {
    const heading = headingMatch[1] as string
    const rest = headingMatch[3] as string
    return `${heading}\n${entry}${rest}`
  }
  return `${entry}\n${existing}`
}
