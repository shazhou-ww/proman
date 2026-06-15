import { execSync } from 'node:child_process'
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

export type CardsValidateOptions = {
  cwd: string
}

export type CardValidationError = {
  file: string
  errors: string[]
}

export type CardsAffectedOptions = {
  cwd: string
  since?: string // commit hash, date, or tag
}

export type CardsTocOptions = {
  cwd: string
}

export type StaleCard = {
  id: string
  title: string
  commits: number
  files: string[]
}

export type UncoveredFile = {
  file: string
  commits: number
}

export type CardsAffectedResult = {
  stale: StaleCard[]
  uncovered: UncoveredFile[]
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

      // Empty inline array: []
      if (value === '[]') {
        result[key] = []
        currentKey = key
      }
      // Inline array: [item1, item2]
      else {
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
    return Array.from(cardIds)
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

const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function cardsValidate(opts: CardsValidateOptions): Promise<CardValidationError[]> {
  const { cwd } = opts
  const cardsDir = join(cwd, 'cards')
  const errors: CardValidationError[] = []

  if (!existsSync(cardsDir)) {
    return errors
  }

  const files = readdirSync(cardsDir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const content = readFileSync(join(cardsDir, file), 'utf-8')
    const fm = parseFrontmatter(content)
    const fileErrors: string[] = []

    if (!fm) {
      fileErrors.push('missing frontmatter')
      errors.push({ file, errors: fileErrors })
      continue
    }

    // id: required, kebab-case
    if (!fm.id) {
      fileErrors.push('missing required field: id')
    } else if (typeof fm.id !== 'string' || !KEBAB_CASE_RE.test(fm.id)) {
      fileErrors.push(`id must be kebab-case, got: ${fm.id}`)
    }

    // title: required
    if (!fm.title) {
      fileErrors.push('missing required field: title')
    }

    // sources: required, array
    if (!fm.sources) {
      fileErrors.push('missing required field: sources')
    } else if (!Array.isArray(fm.sources)) {
      fileErrors.push(`sources must be an array, got: ${typeof fm.sources}`)
    }

    // tags: required, array
    if (!fm.tags) {
      fileErrors.push('missing required field: tags')
    } else if (!Array.isArray(fm.tags)) {
      fileErrors.push(`tags must be an array, got: ${typeof fm.tags}`)
    }

    if (fileErrors.length > 0) {
      errors.push({ file, errors: fileErrors })
    }
  }

  return errors
}

export async function cardsToc(opts: CardsTocOptions): Promise<string> {
  const { cwd } = opts
  const index = loadIndex(cwd)

  const entries = Object.entries(index.by_id)
  if (entries.length === 0) {
    return 'No knowledge cards found. Run `proman cards index` first.'
  }

  const lines: string[] = ['| Card | Sources |', '|------|---------|']
  for (const [id, entry] of entries) {
    const sources = entry.sources.length > 0 ? entry.sources.join(', ') : '(none)'
    lines.push(`| ${id} — ${entry.title} | ${sources} |`)
  }

  return lines.join('\n')
}

export async function cardsAffected(opts: CardsAffectedOptions): Promise<CardsAffectedResult> {
  const { cwd, since } = opts
  const index = loadIndex(cwd)

  // Get changed files from git log
  const sinceArg = since ? since : ''
  // If since looks like a date (contains -), use --since; otherwise treat as commit ref
  let gitCmd: string
  if (!sinceArg) {
    // Default: last 7 days
    gitCmd = 'git log --since="7 days ago" --name-only --pretty=format:"%H"'
  } else if (/^\d{4}-\d{2}/.test(sinceArg)) {
    gitCmd = `git log --since="${sinceArg}" --name-only --pretty=format:"%H"`
  } else {
    gitCmd = `git log ${sinceArg}..HEAD --name-only --pretty=format:"%H"`
  }

  let gitOutput: string
  try {
    gitOutput = execSync(gitCmd, { cwd, encoding: 'utf-8' }).trim()
  } catch {
    return { stale: [], uncovered: [] }
  }

  if (!gitOutput) {
    return { stale: [], uncovered: [] }
  }

  // Parse git output: count commits per file
  const fileCommitCounts = new Map<string, number>()
  let currentCommit = false
  for (const line of gitOutput.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      currentCommit = false
      continue
    }
    // Commit hash lines are 40 hex chars
    if (/^[0-9a-f]{40}$/.test(trimmed)) {
      currentCommit = true
      continue
    }
    if (currentCommit || !trimmed.startsWith('"')) {
      // This is a file path
      fileCommitCounts.set(trimmed, (fileCommitCounts.get(trimmed) ?? 0) + 1)
    }
  }

  // Build reverse index: source pattern -> card IDs (with prefix matching for directories)
  const staleMap = new Map<string, { commits: Set<string>; totalCommits: number }>()
  const coveredFiles = new Set<string>()

  for (const [changedFile, commitCount] of Array.from(fileCommitCounts.entries())) {
    let matched = false

    for (const [cardId, entry] of Object.entries(index.by_id)) {
      for (const source of entry.sources) {
        // Exact match or prefix match (source is a directory)
        const isMatch =
          changedFile === source ||
          changedFile.startsWith(source.endsWith('/') ? source : `${source}/`)
        if (isMatch) {
          matched = true
          coveredFiles.add(changedFile)
          if (!staleMap.has(cardId)) {
            staleMap.set(cardId, { commits: new Set(), totalCommits: 0 })
          }
          const entry = staleMap.get(cardId)!
          entry.commits.add(changedFile)
          entry.totalCommits += commitCount
        }
      }
    }

    // Also check by_source for exact matches
    if (!matched && index.by_source[changedFile]) {
      matched = true
      coveredFiles.add(changedFile)
      for (const cardId of index.by_source[changedFile]) {
        if (!staleMap.has(cardId)) {
          staleMap.set(cardId, { commits: new Set(), totalCommits: 0 })
        }
        const entry = staleMap.get(cardId)!
        entry.commits.add(changedFile)
        entry.totalCommits += commitCount
      }
    }

    if (!matched) {
      // Not covered by any card
    }
  }

  // Build stale cards list
  const stale: StaleCard[] = []
  for (const [cardId, data] of Array.from(staleMap.entries())) {
    const cardEntry = index.by_id[cardId]
    stale.push({
      id: cardId,
      title: cardEntry?.title ?? '',
      commits: data.totalCommits,
      files: Array.from(data.commits),
    })
  }
  // Sort by commit count descending
  stale.sort((a, b) => b.commits - a.commits)

  // Build uncovered files list (filter out non-source noise)
  const IGNORE_PATTERNS = [
    /^\./, // dotfiles and dotdirs (.ocas, .changeset, .gitignore, etc.)
    /^cards\//, // cards themselves
    /^specs\//, // spec files
    /^node_modules\//, // deps
    /\.test\.(ts|tsx|js|jsx)$/, // test files
    /^tests\//, // test directories
    /\.(md|json|yaml|yml|toml|lock)$/, // config/doc files
  ]

  const uncovered: UncoveredFile[] = []
  for (const [file, commits] of Array.from(fileCommitCounts.entries())) {
    if (!coveredFiles.has(file)) {
      // Skip files matching ignore patterns
      if (IGNORE_PATTERNS.some((p) => p.test(file))) continue
      uncovered.push({ file, commits })
    }
  }
  // Sort by commit count descending
  uncovered.sort((a, b) => b.commits - a.commits)

  return { stale, uncovered }
}
