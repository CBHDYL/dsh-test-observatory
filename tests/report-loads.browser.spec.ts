// Visual visibility is a real-browser fact: jsdom does not apply media queries,
// so only Chromium can say whether a page is actually painted. This spec renders
// through the built package (`lib/`), writes the document to disk and loads it
// the way a reader does. It self-skips without an explicit executable, matching
// the repository's real-browser convention.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { afterEach, describe, expect, it } from 'vitest'
import { renderReport } from '../lib/report/index.js'
import { reportModel } from './support/report-inspection.ts'

/** Launch options for the Chromium this environment provides, or undefined to skip. */
function launchOptions(): { headless: boolean; executablePath: string } | undefined {
  const configured = process.env['DSH_BROWSER_EXECUTABLE']
  return configured !== undefined && configured.length > 0
    ? { headless: true, executablePath: configured }
    : undefined
}

const options = launchOptions()
let scratch: string | undefined

afterEach(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe.skipIf(options === undefined)('the built report in a real browser', () => {
  it('paints one page on load instead of hiding the document', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'observatory-loads-'))
    const path = join(scratch, 'report.html')
    await writeFile(path, renderReport(reportModel()), 'utf8')

    const browser = await chromium.launch(options!)
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
      const errors: string[] = []
      page.on('pageerror', (error: Error) => errors.push(error.message))
      await page.goto('file://' + path, { waitUntil: 'load' })
      await page.waitForTimeout(600)

      const seen = await page.evaluate(() => {
        const pages = Array.from(document.querySelectorAll('[data-page]')) as HTMLElement[]
        const painted = pages.filter(node => getComputedStyle(node).display !== 'none')
        return {
          pages: pages.length,
          painted: painted.map(node => node.dataset['page'] ?? ''),
          visibleText: document.body.innerText.trim().length,
        }
      })

      expect(errors).toEqual([])
      expect(seen.pages).toBeGreaterThan(0)
      expect([...new Set(seen.painted)]).toEqual(['decision'])
      expect(seen.visibleText).toBeGreaterThan(500)
    } finally {
      await browser.close()
    }
  }, 60_000)
})
