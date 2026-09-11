/**
 * Draw finding regions onto a page before a screenshot, and remove them again.
 *
 * The overlay is injected as real DOM so the browser's own renderer draws it:
 * the captured image then contains crisp boxes and labels at exactly the
 * coordinates the checks measured, without a bitmap library and without a
 * second coordinate system to keep in sync.
 *
 * Only findings measured in the viewport space can be drawn, because a viewport
 * screenshot shares that space. Anything else is skipped rather than drawn in
 * the wrong place.
 * @module @deepseek-ai/dsh-experience-runner/annotate
 */
import type { Page } from 'playwright-core'
import type { ElementEvidence } from './geometry.ts'

/** One region to mark, with the label shown beside it. */
export interface Annotation {
  /** Short label, such as a rule id with its index. */
  readonly label: string
  /** The element reference and rectangle the label describes. */
  readonly evidence: ElementEvidence
  /** Whether the region blocks a user task, which selects the colour. */
  readonly severity: 'high' | 'medium'
}

/** Handle that removes an injected overlay. */
export interface OverlayHandle {
  /** Remove the overlay from the page. Safe to call more than once. */
  remove(): Promise<void>
}

/** Attribute marking every node this module injects, so removal is exact. */
export const OVERLAY_ATTRIBUTE = 'data-observatory-overlay'

/** Colour used for a blocking finding. */
export const HIGH_COLOR = '#e5484d'

/** Colour used for a non-blocking finding. */
export const MEDIUM_COLOR = '#d97706'

/** Label geometry drawn by the page, mirrored here for the tests. */
export interface OverlayRect {
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Result of one overlay injection. */
export interface OverlayResult {
  /** Regions actually drawn, in viewport coordinates. */
  readonly drawn: readonly OverlayRect[]
  /** Regions skipped because their coordinates were not viewport-space. */
  readonly skipped: readonly string[]
}

/**
 * Draw the given regions and return a handle that removes them.
 *
 * The overlay is `position:fixed`, ignores pointer events and sits at the top
 * of the stacking order, so it cannot change layout, intercept a click or be
 * covered by page content. The caller must inject it *after* every page check
 * has run, so checks never observe the marks they produced.
 * @param page - the page to mark.
 * @param annotations - the regions to draw.
 * @returns the handle plus what was drawn and skipped.
 */
export async function annotate(page: Page, annotations: readonly Annotation[]): Promise<OverlayResult & OverlayHandle> {
  const drawable = annotations.filter(annotation => annotation.evidence.box.space === 'viewport')
  const skipped = annotations.filter(annotation => annotation.evidence.box.space !== 'viewport').map(annotation => annotation.label)
  const payload = drawable.map(annotation => ({
    label: annotation.label,
    color: annotation.severity === 'high' ? HIGH_COLOR : MEDIUM_COLOR,
    x: annotation.evidence.box.x,
    y: annotation.evidence.box.y,
    width: annotation.evidence.box.width,
    height: annotation.evidence.box.height,
  }))
  // Two-argument evaluate on a browser-context function is not expressible
  // through Playwright's generic overloads here, so the call is typed narrowly.
  const evaluator = page as unknown as {
    evaluate: (expression: unknown, arg: unknown, attribute: string) => Promise<OverlayRect[]>
  }
  const drawn = await evaluator.evaluate((items: readonly { label: string; color: string; x: number; y: number; width: number; height: number }[], attribute: string): OverlayRect[] => {
    const host = document.createElement('div')
    host.setAttribute(attribute, 'host')
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    const results: OverlayRect[] = []
    for (const item of items) {
      const box = document.createElement('div')
      box.setAttribute(attribute, 'box')
      box.style.cssText = [
        'position:fixed',
        'box-sizing:border-box',
        'pointer-events:none',
        'border:2px solid ' + item.color,
        'border-radius:4px',
        'left:' + String(item.x) + 'px',
        'top:' + String(item.y) + 'px',
        'width:' + String(item.width) + 'px',
        'height:' + String(item.height) + 'px',
      ].join(';')
      const label = document.createElement('span')
      label.setAttribute(attribute, 'label')
      label.textContent = item.label
      label.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'max-width:60vw',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
        'background:' + item.color,
        'color:#fff',
        'font:600 11px/16px system-ui,sans-serif',
        'padding:1px 5px',
        'border-radius:3px',
      ].join(';')
      // Positioned through the style object rather than the aggregated text, so
      // the placement does not depend on how a given DOM implementation parses
      // a long declaration list. Above the box when it fits, at the top edge
      // otherwise, so a mark near the top of the viewport still shows its label.
      label.style.top = String(Math.max(0, item.y - 18)) + 'px'
      label.style.left = String(Math.max(0, item.x)) + 'px'
      host.append(box, label)
      const measured = {
        label: item.label,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      }
      results.push(measured)
    }
    // An empty host would still be captured in the screenshot, so it is only
    // attached when there is something to draw.
    if (results.length > 0) document.body.append(host)
    return results
  }, payload, OVERLAY_ATTRIBUTE)
  return {
    drawn,
    skipped,
    async remove(): Promise<void> {
      const remover = page as unknown as {
        evaluate: (expression: unknown, attribute: string) => Promise<void>
      }
      await remover.evaluate((attribute: string): void => {
        for (const node of Array.from(document.querySelectorAll('[' + attribute + ']'))) node.remove()
      }, OVERLAY_ATTRIBUTE)
    },
  }
}

/**
 * Whether any overlay node is still attached to the page.
 * @param page - the page to inspect.
 * @returns true when at least one overlay node remains.
 */
export async function overlayPresent(page: Page): Promise<boolean> {
  const reader = page as unknown as {
    evaluate: (expression: unknown, attribute: string) => Promise<boolean>
  }
  return await reader.evaluate((attribute: string): boolean => document.querySelector('[' + attribute + ']') !== null, OVERLAY_ATTRIBUTE)
}