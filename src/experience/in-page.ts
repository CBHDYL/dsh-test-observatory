/**
 * Support for functions that are serialized into the page.
 *
 * Both the visual and the keyboard inspections are sent to the browser by
 * serializing the function source. Two things go wrong when that source runs in
 * a page, and both are handled here:
 *
 * 1. A bundler may rewrite a named function expression into a call to a helper
 *    it defines at module scope. That helper does not exist in the page, so the
 *    serialized source fails with a ReferenceError the moment it runs.
 * 2. An outline may be expressed through the `outline` shorthand, whose
 *    computed value places the colour, the style and the width in any order —
 *    `rgb(0, 0, 0) none 3px` is a real example. Splitting that string on
 *    whitespace breaks the colour apart and misreads a suppressed outline as a
 *    drawn one.
 *
 * {@link drawsFocusIndicator} is self-contained by contract: it closes over
 * nothing, so {@link serializeInspection} can embed it in another function.
 * @module @deepseek-ai/dsh-experience-runner/in-page
 */
import type { Page } from 'playwright-core'

/**
 * Whether an element's computed style draws a visible focus indicator.
 * @param style - the element's computed style.
 * @returns true when an outline or a shadow would be visible.
 */
export function drawsFocusIndicator(style: CSSStyleDeclaration): boolean {
  // A colour may sit anywhere in a longer value, so it is found rather than
  // assumed to be the whole string.
  const isTransparent = (value: string): boolean => {
    const text = value.trim().toLowerCase()
    if (text === '' || text === 'none') return false
    if (text === 'transparent') return true
    const match = /rgba?\(([^)]*)\)/.exec(text)
    if (match !== null) {
      const parts = match[1]!.split(/[\s,/]+/).filter(part => part !== '')
      if (parts.length < 4) return false
      const alpha = Number.parseFloat(parts[3]!)
      return Number.isFinite(alpha) && alpha === 0
    }
    return text.split(/\s+/).includes('transparent')
  }
  const width = Number.parseFloat(style.outlineWidth === '' ? '0' : style.outlineWidth)
  const shorthand = style.outline === '' ? '' : String(style.outline).trim().toLowerCase()
  // The keyword is matched as a whole word, because a colour in the same
  // shorthand may itself contain spaces.
  const shorthandSuppressed = /(^|\s)none(\s|$)/.test(shorthand)
  const shorthandWidthText = /(^|\s)([0-9]*\.?[0-9]+)(?:px|em|rem|pt)(\s|$)|(^|\s)(thin|medium|thick)(\s|$)/.exec(shorthand)
  const shorthandPixels = shorthandWidthText?.[2] === undefined ? undefined : Number.parseFloat(shorthandWidthText[2])
  // A named width is always positive; a numeric one is only drawn when non-zero.
  const shorthandHasWidth = shorthandWidthText !== null && (shorthandPixels === undefined || shorthandPixels > 0)
  const shorthandDrawn = shorthand !== '' && !shorthandSuppressed && shorthandHasWidth && !isTransparent(shorthand)
  const longhandDrawn = style.outlineStyle !== 'none' && width > 0 && !isTransparent(style.outlineColor)
  const shadow = style.boxShadow === '' ? 'none' : String(style.boxShadow)
  return shorthandDrawn || longhandDrawn || (shadow !== 'none' && !isTransparent(shadow))
}

/**
 * The source text of {@link drawsFocusIndicator}, for embedding in a serialized
 * inspection that runs in the page.
 * @returns the function source as an expression.
 */
export function drawsFocusIndicatorSource(): string {
  return '(' + drawsFocusIndicator.toString() + ')'
}

/**
 * Make a serializer-rewritten helper available to page-context functions.
 *
 * The stand-in returns the function unchanged, which preserves the only
 * behaviour the serialized code relies on: naming a function has no effect on
 * how it runs. An existing definition is left alone, so a page that already
 * provides one keeps it.
 * @param page - the page that will run the serialized function.
 * @returns a promise settling once the helper is defined.
 */
export async function ensurePageHelpers(page: Page): Promise<void> {
  const installer = page as unknown as {
    evaluate: (expression: unknown) => Promise<void>
  }
  await installer.evaluate(() => {
    const scope = globalThis as unknown as { __name?: unknown }
    if (typeof scope.__name !== 'function') {
      scope.__name = (value: unknown): unknown => value
    }
  })
}