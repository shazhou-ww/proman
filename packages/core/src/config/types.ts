export type PackageType = 'lib' | 'cli' | 'webui' | 'api'

export type PackageEntry = {
  name: string
  path: string
  type: PackageType
  private?: boolean
}

export type ReleaseConfig = {
  registry?: string
  access?: 'public' | 'restricted'
  gitTagPrefix?: string
}

export type PromanConfig = {
  packages: PackageEntry[]
  release?: ReleaseConfig
}
