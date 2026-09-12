// The suite runs through vitest, which strips types instead of checking them,
// so a fixture that no longer matches its type still passes. That is how thirty
// type errors accumulated behind a fully green suite after the report types
// changed: this package's own tsconfig already included `src` and `tests`, and
// nothing ever ran it. This spec runs the one program a maintainer would run, so
// the sources, the tests, and the built-artifact imports cannot drift again.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the package with its tests', () => {
  it('type-checks as one program', () => {
    const result = spawnSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', join(root, 'tsconfig.json'), '--noEmit'], {
      encoding: 'utf8',
      cwd: root,
    })
    expect(result.stdout.trim()).toBe('')
    expect(result.status).toBe(0)
  }, 300_000)
})
