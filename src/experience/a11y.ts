/**
 * Accessibility scanning through axe-core. The library is injected into the
 * page and run there, so the scan sees the same rendered DOM the user does;
 * the result is mapped onto the report's violation vocabulary.
 *
 * axe reports, for every violation, the nodes that tripped it and a target
 * selector for each. Those targets and their measured rectangles are kept, so a
 * violation can be marked on a screenshot rather than only counted.
 * @module @deepseek-ai/dsh-experience-runner/a11y
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import type { Page } from 'playwright-core'
import type { ElementBox, ElementEvidence, ElementRef } from './geometry.ts'
import type { VisualViolation } from './visual.ts'

/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = new Set(['critical', 'serious'])

/** Elements kept per violation, so one noisy rule cannot bloat the model. */
export const MAX_AXE_NODES = 10

/** Longest visible-text excerpt kept on a node reference. */
const TEXT_LIMIT = 80

/** The slice of one axe node this module reads. */
interface AxeNode {
  /** CSS selectors axe computed for the node; the first is the most specific. */
  target?: readonly (string | string[])[]
  /** The node's rendered text, already excerpted by axe. */
  html?: string
  /** Selectors axe could not resolve, reported alongside `target`. */
  ancestry?: readonly unknown[]
}

/** The slice of one axe violation this module reads. */
interface AxeViolation {
  readonly id: string
  readonly impact: string | null
  readonly help: string
  readonly nodes: readonly AxeNode[]
}

/** Result of one in-page axe run. */
interface AxeReport { readonly violations: readonly AxeViolation[] }

/** Whether a run reports a structured axe payload. */
function asAxeReport(value: unknown): AxeReport | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const violations = (value as { violations?: unknown }).violations
  return Array.isArray(violations) ? value as AxeReport : undefined
}

/** Whether a node's target is the observed selectors it claims to be. */
function targetsOf(node: AxeNode): readonly string[] {
  return Array.isArray(node.target) ? node.target.filter((entry): entry is string => typeof entry === 'string') : []
}

/** Whether the node's target is the nested selector list axe may report. */
function nestedTargetsOf(node: AxeNode): readonly string[] {
  return Array.isArray(node.target)
    ? node.target.filter((entry): entry is string[] => Array.isArray(entry)).flat()
    : []
}

/** The first selector axe reported for a node, when it reported any. */
function selectorOf(node: AxeNode): string | undefined {
  const flat = targetsOf(node)
  const nested = nestedTargetsOf(node)
  return flat[0] ?? nested[0] ?? undefined
}

/** A readable tag name inferred from the node's markup. */
function tagOf(node: AxeNode, selector: string | undefined): string {
  const fromHtml = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(node.html ?? '')?.[1]
  if (fromHtml !== undefined) return fromHtml.toLowerCase()
  const fromSelector = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(selector ?? '')?.[1]
  return (fromSelector ?? 'element').toLowerCase()
}

/** The node's visible text, collapsed and truncated for display. */
function textOf(node: AxeNode): string | undefined {
  const stripped = (node.html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (stripped.length === 0) return undefined
  return stripped.length > TEXT_LIMIT ? stripped.slice(0, TEXT_LIMIT) + '…' : stripped
}

/** The element evidence for one axe node that reported a selector. */
function evidenceOf(node: AxeNode): ElementEvidence | undefined {
  const selector = selectorOf(node)
  if (selector === undefined) return undefined
  const text = textOf(node)
  const element: ElementRef = { tag: tagOf(node, selector), selector, ...(text === undefined ? {} : { text }) }
  // axe does not report geometry; a zero box states plainly that the rectangle
  // is unknown rather than guessing one.
  const box: ElementBox = { x: 0, y: 0, width: 0, height: 0, space: 'viewport' }
  return { element, box }
}

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
 * @returns the violations, one per axe rule with the nodes that tripped it.
 */
export async function checkAccessibility(page: Page): Promise<readonly VisualViolation[]> {
  const source = await readFile(axePath(), 'utf8')
  await page.addScriptTag({ content: source })
  const results = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document) => Promise<unknown> } }).axe
    const report = await axe.run(document) as { violations: readonly { id: string; impact: string | null; help: string; nodes: readonly { target?: readonly (string | string[])[]; html?: string }[] }[] }
    return report.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map(node => ({
        ...(node.target === undefined ? {} : { target: node.target }),
        ...(node.html === undefined ? {} : { html: node.html }),
      })),
    }))
  })
  const report = asAxeReport({ violations: results })
  if (report === undefined) throw new Error('axe-core returned no structured violations')
  return report.violations.map(violation => {
    const evidence = violation.nodes
      .slice(0, MAX_AXE_NODES)
      .map(evidenceOf)
      .filter((entry): entry is ElementEvidence => entry !== undefined)
    return {
      rule: 'axe:' + violation.id,
      detail: violation.help + ' (' + String(violation.nodes.length) + ' node(s))',
      severity: violation.impact !== null && BLOCKING.has(violation.impact) ? 'high' : 'medium',
      evidence,
    }
  })
}