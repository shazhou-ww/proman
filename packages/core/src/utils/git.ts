export type GitOps = {
  getCurrentBranch: () => Promise<string>
  isCleanTree: () => Promise<boolean>
  branchExists: (name: string) => Promise<boolean>
  checkoutNewBranch: (name: string) => Promise<void>
  checkoutNewBranchFrom: (name: string, ref: string) => Promise<void>
  tagExists: (tag: string) => Promise<boolean>
  addAll: () => Promise<void>
  commit: (msg: string, author?: string) => Promise<void>
  push: (branch: string) => Promise<void>
  log: (range?: string) => Promise<string>
  tag: (name: string, message?: string) => Promise<void>
  pushTags: () => Promise<void>
  checkout: (branch: string) => Promise<void>
  merge: (branch: string, opts?: { noFf?: boolean; message?: string }) => Promise<void>
  deleteBranchLocal: (name: string) => Promise<void>
  deleteBranchRemote: (name: string) => Promise<void>
}

async function run(args: string[], cwd: string = process.cwd()): Promise<string> {
  const { execFileSync } = await import('node:child_process')
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    })
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string }
    throw new Error(`git ${args.join(' ')} failed: ${(e.stderr ?? e.stdout ?? '').trim()}`)
  }
}

function parseAuthor(author: string): { name: string; email: string } {
  const m = author.match(/^(.+?)\s*<(.+)>\s*$/)
  if (!m) throw new Error(`invalid author string: ${author}`)
  return { name: (m[1] as string).trim(), email: (m[2] as string).trim() }
}

export function createGitOps(cwd: string = process.cwd()): GitOps {
  return {
    getCurrentBranch: async () => (await run(['branch', '--show-current'], cwd)).trim(),
    isCleanTree: async () => (await run(['status', '--porcelain'], cwd)).trim() === '',
    branchExists: async (name) => {
      const { execFileSync } = await import('node:child_process')
      try {
        execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        return true
      } catch {
        return false
      }
    },
    checkoutNewBranch: async (name) => {
      await run(['checkout', '-b', name], cwd)
    },
    checkoutNewBranchFrom: async (name, ref) => {
      await run(['checkout', '-b', name, ref], cwd)
    },
    tagExists: async (tag) => {
      const { execFileSync } = await import('node:child_process')
      try {
        execFileSync('git', ['rev-parse', '--verify', '-q', `refs/tags/${tag}`], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        return true
      } catch {
        return false
      }
    },
    addAll: async () => {
      await run(['add', '-A'], cwd)
    },
    commit: async (msg, author) => {
      const args = ['commit', '-m', msg]
      if (author) {
        const { name, email } = parseAuthor(author)
        args.unshift('-c', `user.name=${name}`, '-c', `user.email=${email}`)
        args.push(`--author=${author}`)
      }
      await run(args, cwd)
    },
    push: async (branch) => {
      await run(['push', '-u', 'origin', branch], cwd)
    },
    log: async (range) => {
      const args = ['log', '--pretty=%s']
      if (range) args.push(range)
      return await run(args, cwd)
    },
    tag: async (name, message) => {
      const args = message ? ['tag', '-a', name, '-m', message] : ['tag', name]
      await run(args, cwd)
    },
    pushTags: async () => {
      await run(['push', '--tags'], cwd)
    },
    checkout: async (branch) => {
      await run(['checkout', branch], cwd)
    },
    merge: async (branch, opts) => {
      const args = ['merge']
      if (opts?.noFf) args.push('--no-ff')
      if (opts?.message) args.push('-m', opts.message)
      args.push(branch)
      await run(args, cwd)
    },
    deleteBranchLocal: async (name) => {
      await run(['branch', '-d', name], cwd)
    },
    deleteBranchRemote: async (name) => {
      await run(['push', 'origin', '--delete', name], cwd)
    },
  }
}
