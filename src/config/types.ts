export type PackageType = 'lib' | 'cli' | 'webui' | 'api'

export type PackageEntry = {
  name: string
  path: string
  type: PackageType
}

export type ChangesetConfig = {
  fixed?: boolean
}

export type ReleaseConfig = {
  registry?: string
  access?: 'public' | 'restricted'
  gitTagPrefix?: string
}

export type PackageManager = 'npm' | 'pnpm' | 'bun'

export type PromanConfig = {
  name: string
  runtime: 'bun' | 'node'
  packageManager?: PackageManager
  packages: PackageEntry[]
  changeset?: ChangesetConfig
  release?: ReleaseConfig
}
