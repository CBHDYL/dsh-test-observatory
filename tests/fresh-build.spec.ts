// The published entry points resolve to `lib/`, so a stale `lib/` ships the
// previous behaviour while every spec importing `src/` still passes. That is how
// a rewritten report renderer stayed unbuilt and the command kept writing the old
// document. This spec runs the gate that forbids that state, from inside the same
// command that runs every other check.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the build the package installs', () => {
  it('is not older than the sources it is built from', () => {
    const result = spawnSync(process.execPath, [join(root, 'scripts', 'verify-fresh-build.mjs')], { encoding: 'utf8' })
    expect(result.stderr.trim()).toBe('')
    expect(result.status).toBe(0)
  })
})
