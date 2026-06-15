import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// --- Types ---

export type CardEntry = {
  title: string
  sources: string[]
  tags: string[]
}

export type CardsIndex = {
  by_source: Record<string, string[]>
  by_id: Record<string, CardEntry>
}

export type CardSummary = {
  id: string
  title: string
  tags: string[]
}

export type CardDetail = {
  id: string
  title: string
  sources: string[]
  tags: string[]
}

export type CardsIndexOptions = {
  cwd: string
}

export type CardsQueryOptions = {
  cwd: string
  sources?: string[]
  tag?: string
  id?: string
}

export type CardsListOptions = {
  cwd: string
}

export type CardsOrphansOptions = {
  cwd: string
  srcPaths: string[]
}

// --- Helpers ---

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match?.[1]) return null

  const lines = match[1].split('\n')
  const result: Record<string, unknown> = {}
  let currentKey = ''
  let currentArray: string[] | null = null

  for (const line of lines) {
    // Array item (indented with -)
    const arrayMatch = line.match(/^\s+-\s+(.+)$/)
    if (arrayMatch && currentArray !== null) {
      currentArray.push(arrayMatch[1].trim())
      continue
    }

    // Flush previous array
    if (currentArray !== null) {
      result[currentKey] = currentArray
      currentArray = null
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      const key = kvMatch[1]
      const value = kvMatch[2].trim()

      // Inline array: [item1, item2]
      const inlineArrayMatch = value.match(/^\[(.+)\]$/)
      if (inlineArrayMatch) {
        result[key] = inlineArrayMatch[1].split(',').map((s) => s.trim())
        currentKey = key
      } else if (value === '') {
        // Start of multi-line array
        currentKey = key
        currentArray = []
      } else {
        result[key] = value
        currentKey = key
      }
    }
  }

  // Flush final array
  if (currentArray !== null) {
    result[currentKey] = currentArray
  }

  return result
}

function loadIndex(cwd: string): CardsIndex {
  const indexPath = join(cwd, '.cards-index.json')
  if (!existsSync(indexPath)) {
    throw new Error(
      '.cards-index.json not found. Run `proman cards index` first to generate the index.',
    )
  }
  return JSON.parse(readFileSync(indexPath, 'utf-8')) as CardsIndex
}

function collectSourceFiles(cwd: string, srcPaths: string[]): string[] {
  const files: string[] = []

  function walk(dir: string): void {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|mts|cts)$/.test(entry.name)) {
        files.push(relative(cwd, fullPath))
      }
    }
  }

  for (const srcPath of srcPaths) {
    walk(join(cwd, srcPath))
  }

  return files
}

// --- Commands ---

export async function cardsIndex(opts: CardsIndexOptions): Promise<{ count: number }> {
  const { cwd } = opts
  const cardsDir = join(cwd, 'cards')

  const index: CardsIndex = {
    by_source: {},
    by_id: {},
  }

  if (existsSync(cardsDir)) {
    const files = readdirSync(cardsDir).filter((f) => f.endsWith('.md'))

    for (const file of files) {
      const content = readFileSync(join(cardsDir, file), 'utf-8')
      const fm = parseFrontmatter(content)
      if (!fm?.id) continue

      const id = fm.id as string
      const title = (fm.title as string) ?? ''
      const sources = (fm.sources as string[]) ?? []
      const tags = (fm.tags as string[]) ?? []

      index.by_id[id] = { title, sources, tags }

      for (const source of sources) {
        if (!index.by_source[source]) {
          index.by_source[source] = []
        }
        index.by_source[source].push(id)
      }
    }
  }

  const indexPath = join(cwd, '.cards-index.json')
  writeFileSync(indexPath, JSON.stringify(index, null, 2))

  return { count: Object.keys(index.by_id).length }
}

export async function cardsQuery(opts: CardsQueryOptions): Promise<string[] | CardDetail> {
  const { cwd, sources, tag, id } = opts
  const index = loadIndex(cwd)

  if (id !== undefined) {
    const entry = index.by_id[id]
    if (!entry) {
      throw new Error(`Card not found: ${id}`)
    }
    return {
      id,
      title: entry.title,
      sources: entry.sources,
      tags: entry.tags,
    }
  }

  if (tag !== undefined) {
    const matchingIds: string[] = []
    for (const [cardId, entry] of Object.entries(index.by_id)) {
      if (entry.tags.includes(tag)) {
        matchingIds.push(cardId)
      }
    }
    return matchingIds
  }

  if (sources !== undefined) {
    const cardIds = new Set<string>()
    for (const source of sources) {
      const ids = index.by_source[source]
      if (ids) {
        for (const cardId of ids) {
          cardIds.add(cardId)
        }
      }
    }
    return [...cardIds]
  }

  return []
}

export async function cardsList(opts: CardsListOptions): Promise<CardSummary[]> {
  const { cwd } = opts
  const index = loadIndex(cwd)

  return Object.entries(index.by_id).map(([id, entry]) => ({
    id,
    title: entry.title,
    tags: entry.tags,
  }))
}

export async function cardsOrphans(opts: CardsOrphansOptions): Promise<string[]> {
  const { cwd, srcPaths } = opts
  const index = loadIndex(cwd)

  const referencedSources = new Set(Object.keys(index.by_source))
  const allSources = collectSourceFiles(cwd, srcPaths)

  return allSources.filter((f) => !referencedSources.has(f))
}
