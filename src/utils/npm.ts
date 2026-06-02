export type NpmRegistryFetch = (pkg: string) => Promise<string[]>

export type PublishOptions = {
  tag: string
  access?: 'public' | 'restricted'
}

export type NpmRunner = {
  install: () => Promise<void>
  build: () => Promise<void>
  test: () => Promise<void>
  check: () => Promise<void>
  publish: (pkgDir: string, opts: PublishOptions) => Promise<void>
}

export type NextRcOptions = {
  baseVersion: string
  existing: string[]
}

const RELEASE_BRANCH_RE = /^release\/(.+)$/

export function parseReleaseBranch(branch: string): string {
  const m = branch.match(RELEASE_BRANCH_RE)
  if (!m) throw new Error(`not a release branch: '${branch}'`)
  const v = (m[1] as string).trim()
  if (!v) throw new Error(`malformed release branch: '${branch}'`)
  return v
}

export function nextRcNumber(opts: NextRcOptions): number {
  const { baseVersion, existing } = opts
  const prefix = `${baseVersion}-rc.`
  let max = 0
  for (const v of existing) {
    if (!v.startsWith(prefix)) continue
    const tail = v.slice(prefix.length)
    const n = Number.parseInt(tail, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

export function formatRcVersion(baseVersion: string, n: number): string {
  return `${baseVersion}-rc.${n}`
}

export const defaultRegistryFetch: NpmRegistryFetch = async (pkg) => {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`)
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`registry fetch failed for ${pkg}: ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as { versions?: Record<string, unknown> }
  return Object.keys(json.versions ?? {})
}

export type SpawnFn = (
  argv: string[],
  cwd: string,
) => Promise<{ code: number; stdout: string; stderr: string }>

export const defaultSpawn: SpawnFn = async (argv, cwd) => {
  const proc = Bun.spawn(argv, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { code, stdout, stderr }
}

async function runOrThrow(spawn: SpawnFn, argv: string[], cwd: string): Promise<void> {
  const { code, stdout, stderr } = await spawn(argv, cwd)
  if (code !== 0) {
    throw new Error(`${argv.join(' ')} failed: ${stderr.trim() || stdout.trim()}`)
  }
}

export function createNpmRunner(
  runtime: 'bun' | 'node',
  cwd: string,
  spawn: SpawnFn = defaultSpawn,
): NpmRunner {
  const tool = runtime === 'bun' ? 'bun' : 'npm'
  const runScript = (script: string) => async () => {
    await runOrThrow(spawn, [tool, 'run', script], cwd)
  }
  return {
    install: async () => {
      await runOrThrow(spawn, [tool, 'install'], cwd)
    },
    build: runScript('build'),
    test: async () => {
      await runOrThrow(
        spawn,
        [tool, runtime === 'bun' ? 'test' : 'run', ...(runtime === 'bun' ? [] : ['test'])],
        cwd,
      )
    },
    check: runScript('check'),
    publish: async (pkgDir, opts) => {
      const args = [tool, 'publish', '--tag', opts.tag]
      if (opts.access) args.push('--access', opts.access)
      await runOrThrow(spawn, args, pkgDir)
    },
  }
}
