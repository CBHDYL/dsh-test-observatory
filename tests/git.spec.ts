// A trend is a claim about two runs of the same revision, so the run has to
// record which revision it ran. The workspace is the only place that knows, and
// a workspace that cannot answer has to say so rather than let the report invent
// a comparison.
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectRevision } from '../src/command/git.ts'

/** Run one git command in a throwaway repository. */
const git = (cwd: string, args: readonly string[]): void => {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })
}

describe('detectRevision', () => {
  it('reports no revision for a directory that is not a repository', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-observatory-git-'))
    try {
      expect(await detectRevision(dir)).toEqual({ branch: '', commit: '' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports no revision for a directory that does not exist', async () => {
    const dir = join(tmpdir(), 'dsh-observatory-git-absent-' + String(Date.now()))
    expect(await detectRevision(dir)).toEqual({ branch: '', commit: '' })
  })

  it('reads the branch and commit of a repository', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-observatory-git-'))
    try {
      git(dir, ['init', '-q'])
      await writeFile(join(dir, 'a.txt'), 'a\n')
      git(dir, ['add', 'a.txt'])
      git(dir, ['-c', 'user.email=test@example.test', '-c', 'user.name=test', 'commit', '-q', '-m', 'first'])
      const revision = await detectRevision(dir)
      expect(revision.commit).toMatch(/^[0-9a-f]{7,}$/)
      expect(revision.branch.length).toBeGreaterThan(0)
      expect(revision.branch).not.toBe('HEAD')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports no branch when HEAD is detached', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-observatory-git-'))
    try {
      git(dir, ['init', '-q'])
      await writeFile(join(dir, 'a.txt'), 'a\n')
      git(dir, ['add', 'a.txt'])
      git(dir, ['-c', 'user.email=test@example.test', '-c', 'user.name=test', 'commit', '-q', '-m', 'first'])
      const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
      git(dir, ['checkout', '-q', head])
      const revision = await detectRevision(dir)
      // HEAD is not a branch a reader can return to, so it is reported as none.
      expect(revision.branch).toBe('')
      expect(revision.commit).toMatch(/^[0-9a-f]{7,}$/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
