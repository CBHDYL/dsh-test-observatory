/**
 * Reaching a target without a pointer.
 *
 * A keyboard-only user does not click: they Tab until the element they want has
 * focus and then activate it. This module performs that search and reports what
 * actually received focus along the way, so a target that cannot be reached
 * within the budget becomes a finding instead of a silent failure — which is
 * exactly the class of defect an automated rule scan cannot detect.
 * @module @deepseek-ai/dsh-experience-runner/behavior/keyboard
 */
import type { Page } from 'playwright-core'

/** What one focus step landed on. */
export interface FocusStop {
  /** Lowercase tag name of the focused element. */
  readonly tag: string
  /** Accessible-ish description, from id, name, aria-label or text. */
  readonly label: string
  /** Whether the focused element has a visible focus indicator. */
  readonly focusVisible: boolean
}

/** The outcome of trying to focus one target. */
export interface KeyboardReach {
  /** Whether the target received focus within the budget. */
  readonly reached: boolean
  /** Tabs pressed, including the final one when the target was reached. */
  readonly tabs: number
  /** Every element focus passed through, in order. */
  readonly stops: readonly FocusStop[]
}

/** Default number of Tabs attempted before a target counts as unreachable. */
export const DEFAULT_TAB_BUDGET = 40

/**
 * Describe the focused element and whether its focus is visible.
 *
 * Runs inside the page. "Visible" means the computed outline is present and not
 * fully transparent, or a non-none box-shadow is drawn — the two ways a focus
 * indicator is normally expressed. It cannot judge whether the indicator is
 * legible against the background, and does not claim to.
 * @returns the description, or null when no element has focus.
 */
function describeFocus(): FocusStop | null {
  const element = document.activeElement
  if (element === null || element === document.body) return null
  const tag = (element.tagName ?? '').toLowerCase()
  const labelled = element.getAttribute('aria-label')
    ?? element.getAttribute('name')
    ?? (element as HTMLInputElement).placeholder
    ?? ''
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  const label = (labelled !== '' ? labelled : text).slice(0, 60)
  /** Whether a colour is fully transparent, and so draws nothing. */
  const isTransparent = (color: string): boolean => {
    const value = color.trim().toLowerCase()
    if (value === '' || value === 'transparent') return true
    const match = /^rgba?\(([^)]+)\)$/.exec(value)
    if (match === null) return false
    const parts = match[1]!.split(/[\s,\/]+/).filter(part => part !== '')
    // A colour with no alpha channel is fully opaque.
    if (parts.length < 4) return false
    const alpha = Number.parseFloat(parts[3]!)
    return Number.isFinite(alpha) && alpha === 0
  }
  const style = window.getComputedStyle(element)
  const outlineWidth = Number.parseFloat(style.outlineWidth === '' ? '0' : style.outlineWidth)
  // A stylesheet may set the `outline` shorthand; implementations differ on
  // whether they also expose the longhands, so the shorthand is read too rather
  // than missing an indicator that is genuinely drawn. A transparent colour draws
  // nothing whichever form it takes, so alpha is read rather than string-matched.
  const outlineShorthand = style.outline === '' ? '' : style.outline
  const shorthandDrawn = outlineShorthand !== ''
    && !outlineShorthand.startsWith('none')
    && !outlineShorthand.split(/\s+/).some(part => isTransparent(part))
  const longhandDrawn = style.outlineStyle !== 'none' && outlineWidth > 0 && !isTransparent(style.outlineColor)
  const outlineVisible = shorthandDrawn || longhandDrawn
  const shadowVisible = style.boxShadow !== '' && style.boxShadow !== 'none'
  return {
    tag,
    label: label === '' ? tag : tag + '[' + label + ']',
    focusVisible: outlineVisible || shadowVisible,
  }
}

/** Page operations the reach needs, kept narrow so a double can supply them. */
export interface KeyboardPage {
  /** The Playwright page under test. */
  readonly page: Page
}

/**
 * Decide whether the currently focused element is the requested target.
 * @param page - the page to inspect.
 * @param selector - the CSS selector the target must match.
 * @returns true when the active element matches.
 */
async function focusedMatches(page: Page, selector: string): Promise<boolean> {
  const evaluator = page as unknown as {
    evaluate: (expression: unknown, arg: string) => Promise<boolean>
  }
  return await evaluator.evaluate((wanted: string): boolean => {
    const active = document.activeElement
    if (active === null) return false
    try {
      return active.matches(wanted)
    } catch {
      return false
    }
  }, selector)
}

/**
 * Tab until the target has focus, up to a budget.
 * @param page - the page to drive.
 * @param selector - the CSS selector of the element to reach.
 * @param budget - maximum Tabs to press, and whether Shift is held.
 * @returns what was reached and everything focus passed through.
 */
export async function tabToTarget(
  page: Page,
  selector: string,
  budget: number = DEFAULT_TAB_BUDGET,
): Promise<KeyboardReach> {
  const stops: FocusStop[] = []
  // The element the page already focused counts as a stop before any Tab.
  const initial = await page.evaluate(describeFocus)
  if (initial !== null) stops.push(initial)
  if (await focusedMatches(page, selector)) return { reached: true, tabs: 0, stops }

  for (let tab = 1; tab <= budget; tab++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(describeFocus)
    if (stop !== null) stops.push(stop)
    if (await focusedMatches(page, selector)) return { reached: true, tabs: tab, stops }
  }
  return { reached: false, tabs: budget, stops }
}

/**
 * Activate the focused element the way a keyboard user would.
 * @param page - the page to drive.
 * @param key - the activation key; Enter is the default for links and buttons.
 * @returns a promise settling when the key has been sent.
 */
export async function activateFocused(page: Page, key = 'Enter'): Promise<void> {
  await page.keyboard.press(key)
}

/**
 * Dismiss whatever dialog is open with the keyboard's standard escape.
 * @param page - the page to drive.
 * @returns a promise settling when Escape has been sent.
 */
export async function pressEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
}