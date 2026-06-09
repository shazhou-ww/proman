import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

export type InitOptions = {
  targetDir: string
}

function jsonStringify(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

/** Sanitize directory name into a valid npm package name segment */
function toPackageName(dirName: string): string {
  return dirName
    .toLowerCase()
    .replace(/[^a-z0-9._~-]/g, '-') // replace invalid chars
    .replace(/^[._-]+/, '')          // strip leading dots/hyphens/underscores
    .replace(/-+/g, '-')             // collapse consecutive hyphens
    .slice(0, 214)                   // npm name length limit
    || 'my-project'                  // fallback if everything was stripped
}

export async function init(opts: InitOptions): Promise<void> {
  const targetDir = resolve(opts.targetDir)
  const projectName = toPackageName(basename(targetDir))

  // Check if directory is empty
  if (existsSync(targetDir)) {
    const entries = readdirSync(targetDir)
    if (entries.length > 0) {
      throw new Error(`Directory is not empty: ${targetDir}`)
    }
  } else {
    mkdirSync(targetDir, { recursive: true })
  }

  // Create root files
  createRootPackageJson(targetDir, projectName)
  createPromanYaml(targetDir, projectName)
  createPnpmWorkspace(targetDir)
  createBiomeJson(targetDir)
  createTsConfig(targetDir)
  createGitignore(targetDir)

  // Create packages
  createCorePackage(targetDir, projectName)
  createCliPackage(targetDir, projectName)

  // Format all JSON files with biome
  try {
    execSync('pnpm exec biome format --write .', { cwd: targetDir, stdio: 'ignore' })
  } catch {
    // Ignore biome formatting errors during init - user can run format later
  }

  // Print post-init message
  console.log(`✓ Created monorepo in ${targetDir}`)
  console.log('')
  console.log('Next steps:')
  if (targetDir !== process.cwd()) {
    console.log(`  cd ${projectName}`)
  }
  console.log('  pnpm install')
  console.log('  proman build')
}

function createRootPackageJson(targetDir: string, projectName: string): void {
  const content = {
    name: projectName,
    private: true,
    type: 'module',
    scripts: {
      build: 'proman build',
      test: 'proman test',
      check: 'proman check',
      format: 'proman format',
    },
    devDependencies: {
      '@biomejs/biome': '^2.4.16',
      '@shazhou/proman': '^0.7.0',
      '@types/node': '^22.0.0',
      typescript: '^5.9.3',
      vitest: '^4.1.8',
    },
  }
  writeFileSync(join(targetDir, 'package.json'), `${jsonStringify(content)}\n`)
}

function createPromanYaml(targetDir: string, projectName: string): void {
  const content = `packages:
  - name: '@${projectName}/core'
    path: packages/core
    type: lib
  - name: '@${projectName}/cli'
    path: packages/cli
    type: cli
`
  writeFileSync(join(targetDir, 'proman.yaml'), content)
}

function createPnpmWorkspace(targetDir: string): void {
  const content = `packages:
  - 'packages/*'
`
  writeFileSync(join(targetDir, 'pnpm-workspace.yaml'), content)
}

function createBiomeJson(targetDir: string): void {
  const content = {
    $schema: 'https://biomejs.dev/schemas/2.4.16/schema.json',
    assist: { actions: { source: { organizeImports: 'on' } } },
    linter: {
      enabled: true,
      rules: { recommended: true },
    },
    formatter: {
      enabled: true,
      indentStyle: 'space',
      indentWidth: 2,
      lineWidth: 100,
    },
    javascript: {
      formatter: {
        quoteStyle: 'single',
        semicolons: 'asNeeded',
        trailingCommas: 'all',
      },
    },
    files: {
      includes: ['**', '!**/dist', '!**/node_modules', '!**/tests/fixtures', '!.worktrees'],
    },
  }
  writeFileSync(join(targetDir, 'biome.json'), `${jsonStringify(content)}\n`)
}

function createTsConfig(targetDir: string): void {
  const content = {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      esModuleInterop: true,
      resolveJsonModule: true,
      types: ['node'],
      lib: ['ESNext'],
    },
    references: [{ path: './packages/core' }, { path: './packages/cli' }],
  }
  writeFileSync(join(targetDir, 'tsconfig.json'), `${jsonStringify(content)}\n`)
}

function createGitignore(targetDir: string): void {
  const content = `node_modules
dist
.proman
*.tsbuildinfo
`
  writeFileSync(join(targetDir, '.gitignore'), content)
}

function createCorePackage(targetDir: string, projectName: string): void {
  const pkgDir = join(targetDir, 'packages', 'core')
  mkdirSync(join(pkgDir, 'src'), { recursive: true })

  // package.json
  const packageJson = {
    name: `@${projectName}/core`,
    version: '0.0.1',
    type: 'module',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
    },
    files: ['dist'],
    scripts: {
      build: 'tsc --build',
    },
  }
  writeFileSync(join(pkgDir, 'package.json'), `${jsonStringify(packageJson)}\n`)

  // tsconfig.json
  const tsConfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      composite: true,
      outDir: 'dist',
      rootDir: 'src',
      noEmit: false,
      declaration: true,
    },
    include: ['src/**/*'],
  }
  writeFileSync(join(pkgDir, 'tsconfig.json'), `${jsonStringify(tsConfig)}\n`)

  // src/index.ts
  const indexTs = `export function hello(): string {
  return 'hello'
}
`
  writeFileSync(join(pkgDir, 'src', 'index.ts'), indexTs)

  // src/index.test.ts
  const testTs = `import { describe, expect, test } from 'vitest'
import { hello } from './index.js'

describe('hello', () => {
  test('returns hello', () => {
    expect(hello()).toBe('hello')
  })
})
`
  writeFileSync(join(pkgDir, 'src', 'index.test.ts'), testTs)
}

function createCliPackage(targetDir: string, projectName: string): void {
  const pkgDir = join(targetDir, 'packages', 'cli')
  mkdirSync(join(pkgDir, 'src'), { recursive: true })

  // package.json
  const packageJson = {
    name: `@${projectName}/cli`,
    version: '0.0.1',
    type: 'module',
    bin: {
      [projectName]: 'dist/cli.js',
    },
    files: ['dist'],
    scripts: {
      build: 'tsc --build',
    },
    dependencies: {
      [`@${projectName}/core`]: 'workspace:*',
    },
  }
  writeFileSync(join(pkgDir, 'package.json'), `${jsonStringify(packageJson)}\n`)

  // tsconfig.json
  const tsConfig = {
    extends: '../../tsconfig.json',
    compilerOptions: {
      composite: true,
      outDir: 'dist',
      rootDir: 'src',
      noEmit: false,
    },
    include: ['src/**/*'],
    references: [{ path: '../core' }],
  }
  writeFileSync(join(pkgDir, 'tsconfig.json'), `${jsonStringify(tsConfig)}\n`)

  // src/cli.ts
  const cliTs = `#!/usr/bin/env node
import { hello } from '@${projectName}/core'

console.log(hello())
`
  writeFileSync(join(pkgDir, 'src', 'cli.ts'), cliTs)

  // src/cli.test.ts
  const testTs = `import { describe, expect, test } from 'vitest'

describe('cli', () => {
  test('placeholder test', () => {
    expect(true).toBe(true)
  })
})
`
  writeFileSync(join(pkgDir, 'src', 'cli.test.ts'), testTs)
}
