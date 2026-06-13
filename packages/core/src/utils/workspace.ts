import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export type PkgManifest = {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [k: string]: unknown
}

type Unresolved = { pkg: string; dep: string }

function rewriteDepsField(
  pkgName: string,
  field: Record<string, string> | undefined,
  versions: Map<string, string>,
  unresolved: Unresolved[],
): Record<string, string> | undefined {
  if (!field) return undefined
  const out: Record<string, string> = {}
  let changed = false
  for (const [dep, val] of Object.entries(field)) {
    if (val === 'workspace:*') {
      const v = versions.get(dep)
      if (v) {
        out[dep] = v
        changed = true
      } else {
        out[dep] = val
        unresolved.push({ pkg: pkgName, dep })
      }
    } else {
      out[dep] = val
    }
  }
  // Mark via reference identity if changed; caller can compare to original
  void changed
  return out
}

export function rewriteWorkspaceDeps(manifests: PkgManifest[]): {
  rewritten: PkgManifest[]
  unresolved: Unresolved[]
} {
  const versions = new Map<string, string>()
  for (const m of manifests) {
    versions.set(m.name, m.version)
  }
  const unresolved: Unresolved[] = []
  const rewritten = manifests.map((m) => {
    const copy: PkgManifest = { ...m }
    if (m.dependencies) {
      copy.dependencies = rewriteDepsField(m.name, m.dependencies, versions, unresolved)
    }
    if (m.devDependencies) {
      copy.devDependencies = rewriteDepsField(m.name, m.devDependencies, versions, unresolved)
    }
    return copy
  })
  return { rewritten, unresolved }
}

export async function applyWorkspaceRewrites(
  rootDir: string,
  packages: { name: string; path: string }[],
): Promise<string[]> {
  const paths = packages.map((p) => resolve(rootDir, p.path, 'package.json'))
  const manifests: PkgManifest[] = []
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i] as string
    let text: string
    try {
      text = await readFile(p, 'utf8')
    } catch (err) {
      throw new Error(`package.json not found at ${p}: ${(err as Error).message}`)
    }
    manifests.push(JSON.parse(text) as PkgManifest)
  }

  const { rewritten } = rewriteWorkspaceDeps(manifests)
  const changed: string[] = []
  for (let i = 0; i < paths.length; i++) {
    const before = JSON.stringify(manifests[i])
    const after = JSON.stringify(rewritten[i])
    if (before !== after) {
      const p = paths[i] as string
      const newText = `${JSON.stringify(rewritten[i], null, 2)}\n`
      await writeFile(p, newText)
      changed.push(p)
    }
  }
  return changed
}
