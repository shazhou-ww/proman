export type GitOps = {
  getCurrentBranch: () => Promise<string>
  isCleanTree: () => Promise<boolean>
  branchExists: (name: string) => Promise<boolean>
  checkoutNewBranch: (name: string) => Promise<void>
  addAll: () => Promise<void>
  commit: (msg: string, author?: string) => Promise<void>
  push: (branch: string) => Promise<void>
}

async function run(args: string[], cwd: string = process.cwd()): Promise<string> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const code = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim() || stdout.trim()}`)
  }
  return stdout
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
      const proc = Bun.spawn(['git', 'show-ref', '--verify', '--quiet', `refs/heads/${name}`], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const code = await proc.exited
      return code === 0
    },
    checkoutNewBranch: async (name) => {
      await run(['checkout', '-b', name], cwd)
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
  }
}
