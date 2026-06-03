import type { PackageEntry, PackageType, PromanConfig } from './types.ts'

const ERR_PREFIX = 'Invalid proman config:'
const VALID_TYPES: readonly PackageType[] = ['lib', 'cli', 'webui', 'api']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatePackageEntry(entry: unknown, index: number): PackageEntry {
  if (!isPlainObject(entry)) {
    throw new Error(`${ERR_PREFIX} packages[${index}] must be an object`)
  }
  const { name, path, type } = entry
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${ERR_PREFIX} packages[${index}].name must be a non-empty string`)
  }
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`${ERR_PREFIX} packages[${index}].path must be a non-empty string`)
  }
  let resolvedType: PackageType = 'lib'
  if (type !== undefined) {
    if (typeof type !== 'string' || !VALID_TYPES.includes(type as PackageType)) {
      throw new Error(
        `${ERR_PREFIX} packages[${index}].type must be one of 'lib' | 'cli' | 'webui' | 'api'`,
      )
    }
    resolvedType = type as PackageType
  }
  return { name, path, type: resolvedType }
}

/**
 * Pure validator. Throws Error with descriptive message on failure.
 * Returns a typed PromanConfig (does not mutate input, does not apply defaults).
 */
export function validateConfig(value: unknown): PromanConfig {
  if (!isPlainObject(value)) {
    throw new Error(`${ERR_PREFIX} config must be an object`)
  }

  const { name, runtime, packages, changeset, release } = value

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`${ERR_PREFIX} name must be a non-empty string`)
  }

  if (runtime !== 'bun' && runtime !== 'node') {
    throw new Error(`${ERR_PREFIX} runtime must be one of 'bun' | 'node'`)
  }

  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error(`${ERR_PREFIX} packages must be a non-empty array`)
  }
  const validatedPackages = packages.map((p, i) => validatePackageEntry(p, i))

  let validatedChangeset: PromanConfig['changeset']
  if (changeset !== undefined) {
    if (!isPlainObject(changeset)) {
      throw new Error(`${ERR_PREFIX} changeset must be an object`)
    }
    if (changeset.fixed !== undefined && typeof changeset.fixed !== 'boolean') {
      throw new Error(`${ERR_PREFIX} changeset.fixed must be a boolean`)
    }
    validatedChangeset = { fixed: changeset.fixed as boolean | undefined }
  }

  let validatedRelease: PromanConfig['release']
  if (release !== undefined) {
    if (!isPlainObject(release)) {
      throw new Error(`${ERR_PREFIX} release must be an object`)
    }
    const { registry, access, gitTagPrefix } = release
    if (registry !== undefined && (typeof registry !== 'string' || registry.length === 0)) {
      throw new Error(`${ERR_PREFIX} release.registry must be a non-empty string`)
    }
    if (access !== undefined && access !== 'public' && access !== 'restricted') {
      throw new Error(`${ERR_PREFIX} release.access must be 'public' or 'restricted'`)
    }
    if (gitTagPrefix !== undefined && typeof gitTagPrefix !== 'string') {
      throw new Error(`${ERR_PREFIX} release.gitTagPrefix must be a string`)
    }
    validatedRelease = {
      registry: registry as string | undefined,
      access: access as 'public' | 'restricted' | undefined,
      gitTagPrefix: gitTagPrefix as string | undefined,
    }
  }

  const result: PromanConfig = {
    name,
    runtime,
    packages: validatedPackages,
  }
  if (validatedChangeset !== undefined) result.changeset = validatedChangeset
  if (validatedRelease !== undefined) result.release = validatedRelease
  return result
}
