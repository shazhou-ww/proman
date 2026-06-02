export type PackageEntry = {
  name: string
  path: string
}

export type ChangesetConfig = {
  fixed?: boolean
}

export type ReleaseConfig = {
  registry?: string
  access?: 'public' | 'restricted'
  gitTagPrefix?: string
}

export type PromanConfig = {
  name: string
  runtime: 'bun' | 'node'
  packages: PackageEntry[]
  changeset?: ChangesetConfig
  release?: ReleaseConfig
}
