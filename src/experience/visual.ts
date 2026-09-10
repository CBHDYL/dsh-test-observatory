/**
 * Deterministic visual checks over a live page. Every finding is a browser
 * fact — a measurement, a failed request, a missing attribute — so the visual
 * dimension of the score reproduces from the run rather than from an opinion.
 *
 * The inspection itself is a self-contained function: it is serialized into
 * the page by Playwright, and unit-tested directly against a DOM.
 * @module @deepseek-ai/dsh-experience-runner/visual
 */

import type { Page } from 'playwright-core'

/** One visual violation. */
export interface VisualViolation {
  /** Stable rule id, such as `image-broken`. */
  readonly rule: string
  /** What was observed, in concrete terms. */
  readonly detail: string
  /** Whether the finding blocks a user task. */
  readonly severity: 'high' | 'medium'
}

/**
 * Inspect one rendered document for objective visual defects. Self-contained by
 * contract: it closes over nothing, so Playwright can serialize it into a page.
 * @param root - the document to inspect.
 * @returns the violations found, in rule order.
 */
export function collectViolations(root: Document): VisualViolation[] {
  const violations: VisualViolation[] = []
  const images = Array.from(root.querySelectorAll('img'))
  const broken = images.filter(image => image.complete && image.naturalWidth === 0)
  if (broken.length > 0) {
    const source = broken[0]?.getAttribute('src')
    violations.push({
      rule: 'image-broken',
      detail: String(broken.length) + ' image(s) failed to load, first: ' + (source === null || source === undefined ? '(no src)' : source),
      severity: 'high',
    })
  }
  const unlabelled = images.filter(image => !image.hasAttribute('alt'))
  if (unlabelled.length > 0) {
    violations.push({
      rule: 'image-no-alt',
      detail: String(unlabelled.length) + ' image(s) have no alt attribute',
      severity: 'medium',
    })
  }
  const doc = root.documentElement
  const overflow = doc.scrollWidth - doc.clientWidth
  if (overflow > 2) {
    violations.push({
      rule: 'horizontal-overflow',
      detail: 'page is ' + String(overflow) + 'px wider than the viewport',
      severity: 'high',
    })
  }
  const viewport = root.defaultView
  const viewportWidth = viewport === null ? 0 : viewport.innerWidth
  const outside = Array.from(root.querySelectorAll('body *')).filter(element => {
    const box = element.getBoundingClientRect()
    return box.width > 0 && box.right > viewportWidth + 2
  })
  if (outside.length > 0) {
    const first = outside[0]
    violations.push({
      rule: 'element-outside-viewport',
      detail: String(outside.length) + ' element(s) extend past the viewport, first: ' + (first?.tagName ?? ''),
      severity: 'medium',
    })
  }
  const placeholderOnly = Array.from(root.querySelectorAll('input, textarea')).filter(field => {
    const element = field as HTMLInputElement
    const hasLabel = element.labels !== null && element.labels.length > 0
    const hasAria = element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')
    return element.hasAttribute('placeholder') && !hasLabel && !hasAria
  })
  if (placeholderOnly.length > 0) {
    violations.push({
      rule: 'placeholder-only-field',
      detail: String(placeholderOnly.length) + ' field(s) rely on a placeholder with no label',
      severity: 'medium',
    })
  }
  return violations
}

/**
 * Collect the visual violations of the page's current state.
 * @param page - the page to measure.
 * @returns the violations found, in rule order.
 */
export async function checkVisual(page: Page): Promise<readonly VisualViolation[]> {
  // The inspection runs in the page as a serialized function call. Passing the
  // function source as an expression avoids holding a document handle across a
  // possible navigation, which would fail with a destroyed execution context.
  // The narrow evaluator type keeps the signature explicit instead of inferring
  // through Playwright's generic overloads.
  const evaluator = page as unknown as {
    evaluate: (expression: string) => Promise<VisualViolation[]>
  }
  const expression = '(' + collectViolations.toString() + ')(document)'
  return evaluator.evaluate(expression)
}