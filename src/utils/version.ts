import type { Bump, Changeset } from './changeset.ts'

const VERSION_CORE_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[\w.+-]+)?$/

export function bumpVersion(current: string, bump: Bump): string {
  const m = current.match(VERSION_CORE_RE)
  if (!m) {
    throw new Error(`invalid version: '${current}'`)
  }
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3])
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const ORDER: Record<Bump, number> = { patch: 1, minor: 2, major: 3 }

export function inferBump(changesets: Changeset[], _fixed: boolean): Bump | null {
  let best: Bump | null = null
  for (const c of changesets) {
    for (const v of Object.values(c.packages)) {
      if (best === null || ORDER[v] > ORDER[best]) {
        best = v
      }
    }
  }
  return best
}

const TAG_RE = /^v?(\d+\.\d+\.\d+(?:-[\w.+-]+)?)$/

export function parseTagVersion(tag: string): string {
  const m = tag.match(TAG_RE)
  if (!m) {
    throw new Error(`invalid tag: '${tag}'`)
  }
  return m[1] as string
}
