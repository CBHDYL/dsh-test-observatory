#!/usr/bin/env node
/**
 * Regenerate `src/report/assets.generated.ts` from the reviewed Test Observatory
 * prototype document, so the shipped renderer and the reviewed design cannot
 * drift. The prototype is the design source of record and lives outside this
 * repository, so its path is an argument.
 *
 * Usage: node --import tsx/esm scripts/extract-report-assets.mts <prototype.html> [out.ts]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const [source, output] = process.argv.slice(2)
if (source === undefined) {
  console.error('usage: extract-report-assets.mts <prototype.html> [out.ts]')
  process.exit(1)
}
const outPath = resolve(output ?? join(here, '..', 'src', 'report', 'assets.generated.ts'))

const BACKTICK = String.fromCharCode(96)

/** Read one required prototype region, failing loudly when the markers moved. */
function region(html: string, pattern: RegExp, label: string): string {
  const match = pattern.exec(html)
  if (match?.[1] === undefined) throw new Error(`prototype is missing the ${label} region`)
  return match[1]
}

/** Escape text for embedding inside a TypeScript template literal. */
function escape(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll(BACKTICK, '\\' + BACKTICK).replaceAll('${', '\\${')
}

const html = readFileSync(resolve(source), 'utf8')
const parts = {
  REPORT_STYLE: region(html, /<style>([\s\S]*?)<\/style>/, 'style'),
  REPORT_BODY: region(html, /<div class="shell">([\s\S]*?)<!--OBSERVATORY_OVERLAY-->/, 'body'),
  REPORT_OVERLAY: region(html, /<!--OBSERVATORY_OVERLAY-->([\s\S]*?)<!--OBSERVATORY_SCRIPT-->/, 'overlay').trim(),
  REPORT_SCRIPT: region(html, /<!--OBSERVATORY_SCRIPT--><script>([\s\S]*?)<\/script>/, 'client script'),
}

const document = [
  '/**',
  ' * GENERATED - do not edit by hand. Extracted from the approved Test Observatory',
  ' * prototype so the shipped renderer and the reviewed design cannot drift.',
  ' * @module @cbhdyl/dsh-test-observatory/report/assets',
  ' */',
  '',
  ...Object.entries(parts).flatMap(([name, text]) => [`export const ${name} = ${BACKTICK}${escape(text)}${BACKTICK}`, '']),
].join('\n')

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, document)
console.log('wrote', outPath, Object.entries(parts).map(([name, text]) => `${name}=${String(text.length)}`).join(' '))
