/**
 * Accessibility scanning through axe-core. The library is injected into the
 * page and run there, so the scan sees the same rendered DOM the user does;
 * the result is mapped onto the report's violation vocabulary.
 * @module @deepseek-ai/dsh-experience-runner/a11y
 */

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { Page } from 'playwright-core'
import type { VisualViolation } from './visual.ts'

/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = new Set(['critical', 'serious'])

/**
 * Resolve the axe-core browser bundle path.
 * @returns the absolute path of the axe source file.
 */
function axePath(): string {
  const require = createRequire(import.meta.url)
  return require.resolve('axe-core/axe.min.js')
}

/**
 * Run an axe-core scan over the page's current state.
 * @param page - the page to scan.
 * @returns the violations, one per axe rule with at least one node.
 */
export async function checkAccessibility(page: Page): Promise<readonly VisualViolation[]> {
  const source = await readFile(axePath(), 'utf8')
  await page.addScriptTag({ content: source })
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: unknown[] }[] }> } }).axe
    const report = await axe.run(document)
    return report.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
    }))
  })
  return results.map(result => ({
    rule: 'axe:' + result.id,
    detail: result.help + ' (' + String(result.nodes) + ' node(s))',
    severity: result.impact !== null && BLOCKING.has(result.impact) ? 'high' : 'medium',
  }))
}
