/**
 * Dynamic-content masking for captures.
 *
 * A timestamp, a live counter or an avatar changes between two runs of the same
 * page, so a capture that includes one cannot be compared with any later
 * capture. Masking hides those regions for the duration of one capture and
 * restores them afterwards, so the page itself is never modified in a lasting
 * way.
 * @module @deepseek-ai/dsh-experience-runner/mask
 */
import type { Page } from 'playwright-core'

/** Handle that restores the elements a mask hid. */
export interface MaskHandle {
  /** Selectors that matched at least one element. */
  readonly matched: readonly string[]
  /** Selectors that matched nothing, so a typo is visible rather than silent. */
  readonly unmatched: readonly string[]
  /** Restore visibility. Safe to call more than once. */
  restore(): Promise<void>
}

/**
 * Hide the elements matching the given selectors.
 *
 * Visibility is saved and restored per element rather than via an injected
 * stylesheet, so an element's own inline style survives untouched.
 * @param page - the page to mask.
 * @param selectors - CSS selectors for dynamic regions.
 * @returns the handle that restores them.
 */
export async function maskDynamic(page: Page, selectors: readonly string[]): Promise<MaskHandle> {
  if (selectors.length === 0) {
    return { matched: [], unmatched: [], restore: async () => undefined }
  }
  const evaluator = page as unknown as {
    evaluate: (expression: unknown, arg: readonly string[]) => Promise<{ matched: readonly string[]; unmatched: readonly string[] }>
  }
  const result = await evaluator.evaluate((wanted: readonly string[]): { matched: string[]; unmatched: string[] } => {
    const matched: string[] = []
    const unmatched: string[] = []
    for (const selector of wanted) {
      const found = Array.from(document.querySelectorAll(selector))
      if (found.length === 0) {
        unmatched.push(selector)
        continue
      }
      matched.push(selector)
      for (const element of found) {
        const target = element as HTMLElement
        // The previous inline value is recorded so restore() is exact.
        target.setAttribute('data-observatory-mask-was', target.style.visibility)
        target.style.visibility = 'hidden'
      }
    }
    return { matched, unmatched }
  }, selectors)
  return {
    matched: result.matched,
    unmatched: result.unmatched,
    async restore(): Promise<void> {
      const restorer = page as unknown as {
        evaluate: (expression: unknown) => Promise<void>
      }
      await restorer.evaluate((): void => {
        for (const element of Array.from(document.querySelectorAll('[data-observatory-mask-was]'))) {
          const target = element as HTMLElement
          target.style.visibility = target.getAttribute('data-observatory-mask-was') ?? ''
          target.removeAttribute('data-observatory-mask-was')
        }
      })
    },
  }
}