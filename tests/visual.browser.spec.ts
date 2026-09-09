// Visual checks measure real layout, which jsdom does not compute, so this
// spec drives the installed Chromium. It self-skips when no executable is
// resolvable, matching the repository's real-browser test convention.
import { describe, expect, it } from 'vitest'
import { chromium } from 'playwright-core'
import { checkVisual } from '../src/experience/visual.ts'

/**
 * Launch options for the Chromium this environment provides. The spec skips
 * without an explicit executable, because the Playwright cache in a checkout
 * does not always carry the headless shell this version asks for.
 */
function launchOptions(): { headless: boolean; executablePath?: string } | undefined {
  const configured = process.env['DSH_BROWSER_EXECUTABLE']
  return configured !== undefined && configured.length > 0
    ? { headless: true, executablePath: configured }
    : undefined
}

const PAGE = [
  '<!DOCTYPE html><html><body style="margin:0">',
  '<img src="/missing.png" id="broken">',
  '<img src="/ok.png" id="noalt">',
  '<div style="width:2000px;height:10px;background:#eee"></div>',
  '<input id="field" placeholder="Email">',
  '</body></html>',
].join('')

const options = launchOptions()

describe.skipIf(options === undefined)('checkVisual in a real browser', () => {
  it('reports broken images, missing alt text, overflow and placeholder-only fields', async () => {
    const browser = await chromium.launch(options)
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
      await page.setContent(PAGE, { waitUntil: 'domcontentloaded' })
      const violations = await checkVisual(page)
      const rules = violations.map(violation => violation.rule)
      expect(rules).toContain('image-broken')
      expect(rules).toContain('image-no-alt')
      expect(rules).toContain('horizontal-overflow')
      expect(rules).toContain('placeholder-only-field')
      expect(violations.every(violation => violation.detail.length > 0)).toBe(true)
    } finally {
      await browser.close()
    }
  }, 60_000)

  it('reports nothing for a clean page', async () => {
    const browser = await chromium.launch(options)
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
      await page.setContent('<!DOCTYPE html><html><body><p>Clean page</p></body></html>')
      await expect(checkVisual(page)).resolves.toEqual([])
    } finally {
      await browser.close()
    }
  }, 60_000)
})