#!/usr/bin/env node
/**
 * Export the package as a standalone GitHub repository.
 *
 * Copies exactly the files a public repo needs — never node_modules, build
 * cache, or tarballs — and rewrites the workspace-only bits of package.json so
 * the result installs with plain npm/pnpm outside the monorepo.
 *
 * Usage: node scripts/export-repo.mjs <target-dir>
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = resolve(here, '..')
const target = resolve(process.argv[2] ?? '')

if (process.argv[2] === undefined) {
  console.error('usage: node scripts/export-repo.mjs <target-dir>')
  process.exit(1)
}

/** Files and directories the public repo carries. */
const ENTRIES = [
  'src',
  'tests',
  'lib',
  'scripts',
  'marketplace',
  'package.json',
  'tsconfig.json',
  'tsdown.config.ts',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'USAGE.zh.md',
  'LICENSE',
  '.gitignore',
]

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

for (const entry of ENTRIES) {
  const from = join(source, entry)
  if (!existsSync(from)) {
    console.error('missing:', entry)
    process.exit(1)
  }
  await cp(from, join(target, entry), { recursive: true })
  console.log('copied', entry)
}

// The monorepo README pair links the harness documentation through relative
// paths that leave this repository. Point those links at the harness repo and
// drop the repo-governance frontmatter the standalone project does not use.
const HARNESS_BLOB = 'https://github.com/deepseek-ai/deepseek-harness/blob/master'
const README_REWRITES = [
  ['../../..' + '/docs/', `${HARNESS_BLOB}/docs/`],
  ['../README.md', `${HARNESS_BLOB}/packages/test-runner/README.md`],
  ['../README.zh.md', `${HARNESS_BLOB}/packages/test-runner/README.zh.md`],
]
for (const name of ['README.md', 'README.zh.md']) {
  const path = join(target, name)
  let text = await readFile(path, 'utf8')
  text = text.replace(/^---\n[\s\S]*?\n---\n\n/u, '')
  for (const [from, to] of README_REWRITES) text = text.replaceAll(`](${from}`, `](${to}`)
  await writeFile(path, text)
}
console.log('rewrote README repository links')

// The monorepo build writes type maps that point at ../../../ and an
// incremental-build cache; neither belongs in a public repo.
await rm(join(target, 'lib/types'), { recursive: true, force: true })
await rm(join(target, 'lib/tsconfig.tsbuildinfo'), { force: true })
console.log('removed lib/types and the build cache')

const manifestPath = join(target, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

// A standalone repo installs its own dev tooling; the monorepo provides these.
const harnessPeerVersions = {
  '@deepseek-ai/cordis': '^4.0.2',
  '@deepseek-ai/dsh-commands': '^0.1.0-alpha.1',
  '@deepseek-ai/dsh-llm': '^0.1.0-alpha.1',
  '@deepseek-ai/dsh-tools': '^0.1.0-alpha.1',
}
manifest.devDependencies = {
  ...harnessPeerVersions,
  '@types/node': '^22.20.0',
  jsdom: '^28.0.0',
  tsdown: '^0.22.2',
  typescript: '^5.9.0',
  vitest: '^4.1.8',
}
// The monorepo manifest uses the workspace protocol, which only resolves inside
// the workspace; a standalone install needs concrete ranges. The peer ranges are
// the published contracts, so they are written from the same table the dev
// dependencies use rather than duplicated.
manifest.peerDependencies = { ...harnessPeerVersions }
// The monorepo manifest points at the harness repository with a directory; the
// standalone repo is its own project.
manifest.repository = {
  type: 'git',
  url: 'git+https://github.com/CBHDYL/dsh-test-observatory.git',
}
manifest.scripts = {
  build: 'tsc -p tsconfig.build.json && tsdown',
  test: 'vitest run',
  prepack: 'npm run build',
}
// lib/ is committed so `dsh plugin add github:...` needs no build step.
delete manifest.files

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('rewrote package.json for a standalone repo')

// The tests import through relative paths already; the repo needs its own
// tsconfig without monorepo project references.
/** Shared compiler options for the standalone repo. */
const compilerOptions = {
  target: 'es2024',
  module: 'nodenext',
  moduleResolution: 'nodenext',
  strict: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  skipLibCheck: true,
  types: ['node'],
}

// Type-checking config for editors and `tsc --noEmit`.
await writeFile(join(target, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { ...compilerOptions, noEmit: true, allowImportingTsExtensions: true },
  include: ['src', 'tests'],
}, null, 2) + '\n')

// Build config: emits the JavaScript tsdown bundles, so the entry paths in
// tsdown.config.ts resolve without the monorepo's project references.
await writeFile(join(target, 'tsconfig.build.json'), JSON.stringify({
  compilerOptions: { ...compilerOptions, rootDir: 'src', outDir: 'lib/types', declaration: true, allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true },
  include: ['src'],
}, null, 2) + '\n')
console.log('wrote standalone tsconfig.json and tsconfig.build.json')

console.log('')
console.log('exported to', target)
console.log('next: cd', target, '&& git init && git add -A && git commit -m "initial"')