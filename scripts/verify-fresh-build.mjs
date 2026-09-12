#!/usr/bin/env node
/**
 * Fail when the built package is older than the sources it is built from.
 *
 * The published entry points resolve to `lib/`, so a stale `lib/` ships the
 * previous behaviour while every spec that imports `src/` still passes. That
 * happened once already: the report renderer was rewritten, `lib/` was not
 * rebuilt, and the command kept writing the old document while the suite was
 * green. This gate makes that state impossible to miss.
 *
 * A build writes `lib/types/**` first and the bundles after, so the oldest
 * output marks when the build started. Any source newer than that is a source
 * the build never saw.
 *
 * Usage: node scripts/verify-fresh-build.mjs [--quiet]
 */

import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const quiet = process.argv.includes('--quiet')

/** Every file under `directory`, recursively; a missing directory yields none. */
function walk(directory) {
  const found = []
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile()) found.push(path)
    }
  }
  return found
}

/** The newest file of `files`, or undefined when there are none. */
function newest(files) {
  return files.reduce((best, path) => {
    const time = statSync(path).mtimeMs
    return best === undefined || time > best.time ? { path, time } : best
  }, undefined)
}

/** The oldest file of `files`, or undefined when there are none. */
function oldest(files) {
  return files.reduce((best, path) => {
    const time = statSync(path).mtimeMs
    return best === undefined || time < best.time ? { path, time } : best
  }, undefined)
}

const source = newest(walk(join(root, 'src')))
const built = [...walk(join(root, 'lib'))]
if (source === undefined) {
  console.error('verify-fresh-build: no sources under src/ — run this from the package root')
  process.exit(1)
}
const buildStart = oldest(built)
if (buildStart === undefined) {
  console.error('verify-fresh-build: lib/ is empty; the package has never been built')
  console.error('  fix: npm run build')
  process.exit(1)
}

const show = entry => new Date(entry.time).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
if (source.time > buildStart.time) {
  console.error('verify-fresh-build: the build is older than the source it is built from.')
  console.error('  newest source: ' + relative(root, source.path) + '  ' + show(source))
  console.error('  build started: ' + relative(root, buildStart.path) + '  ' + show(buildStart))
  console.error('  the published entry points resolve to lib/, so every spec that imports src/ would')
  console.error('  pass while the installed package still runs the previous behaviour.')
  console.error('  fix: npm run build')
  process.exit(1)
}
if (!quiet) console.log('verify-fresh-build: lib/ is newer than src/ (newest source ' + show(source) + ')')
