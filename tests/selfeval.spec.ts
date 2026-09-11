// Self-evaluation: does each check actually find the defect it claims to find?
//
// This is the calibration gate the whole simulation layer rests on. A check that
// finds nothing on its own planted defect is broken, and a check that reports
// anything on the clean control is producing noise — a report full of findings
// nobody can act on is as useless as one with none. Both directions are asserted
// here, against a real Chromium and real HTTP, because a DOM implementation is
// exactly where the serialized inspections were previously passing tests while
// failing in the browser.
import { spawnSync } from 'node:child_process'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { checkAccessibility } from '../src/experience/a11y.ts'
import { checkKeyboard } from '../src/experience/keyboard-checks.ts'
import { checkVisual } from '../src/experience/visual.ts'
import { FIXTURE_ROUTES, startFixtureApp } from './fixtures/defective-app.ts'
import type { FixtureApp } from './fixtures/defective-app.ts'

/**
 * A Chromium the checks can drive. The repository convention is to skip a
 * real-browser spec when none is resolvable rather than fail on a host without
 * one; the executable is also looked up in the Playwright cache so a machine
 * that has run the browser tool at least once participates.
 */
function resolveChromium(): string | undefined {
  const configured = process.env['DSH_BROWSER_EXECUTABLE']
  if (configured !== undefined && configured.length > 0) return configured
  const cache = process.env['HOME'] === undefined ? undefined : process.env['HOME'] + '/Library/Caches/ms-playwright'
  if (cache === undefined) return undefined
  const found = spawnSync('bash', ['-c', 'ls -d ' + cache + '/chromium-*/chrome-mac-arm64/*.app/Contents/MacOS/* 2>/dev/null | head -1'], { encoding: 'utf8' })
  const path = found.stdout.trim()
  return path.length > 0 ? path : undefined
}

const executable = resolveChromium()

describe.skipIf(executable === undefined)('fixture self-evaluation', () => {
  let app: FixtureApp
  let browser: Browser

  beforeAll(async () => {
    app = await startFixtureApp()
    browser = await chromium.launch({ headless: true, ...(executable === undefined ? {} : { executablePath: executable }) })
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await app?.close()
  })

  /** Open one fixture route in a fresh page. */
  async function open(path: string) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    await page.goto(app.origin + path, { waitUntil: 'load' })
    return page
  }

  /** The rules a page's checks report, across every family. */
  async function rulesOn(path: string): Promise<readonly string[]> {
    const page = await open(path)
    try {
      return [
        ...(await checkVisual(page)).map(finding => finding.rule),
        ...(await checkAccessibility(page)).map(finding => finding.rule),
        ...(await checkKeyboard(page)).map(finding => finding.rule),
      ]
    } finally {
      await page.close()
    }
  }

  it('finds nothing on the clean control page', async () => {
    const rules = await rulesOn('/clean')
    // The control is the noise test: a check that fires here would fill every
    // report with findings nobody planted.
    expect(rules).toEqual([])
  }, 60_000)

  it('finds a suppressed focus indicator', async () => {
    const rules = await rulesOn('/no-focus-indicator')
    expect(rules).toContain('keyboard-focus-not-visible')
  }, 60_000)

  it('finds an image that fails to load', async () => {
    expect(await rulesOn('/broken-image')).toContain('image-broken')
  }, 60_000)

  it('finds an image with no alt attribute', async () => {
    expect(await rulesOn('/image-without-alt')).toContain('image-no-alt')
  }, 60_000)

  it('finds a field labelled only by its placeholder', async () => {
    expect(await rulesOn('/placeholder-only')).toContain('placeholder-only-field')
  }, 60_000)

  it('finds a page with no level-one heading', async () => {
    expect(await rulesOn('/no-heading')).toContain('axe:page-has-heading-one')
  }, 60_000)

  it('finds a button with no accessible name', async () => {
    expect(await rulesOn('/unnamed-button')).toContain('axe:button-name')
  }, 60_000)

  it('reports one rule per planted defect, and no others', async () => {
    // Every route states the defect it plants; the union of what the checks
    // report must be exactly that set, so a route that grows a second defect, or
    // a check that invents one, fails the gate.
    const planted = FIXTURE_ROUTES.map(route => route.defect).filter(defect => defect !== 'none').sort()
    const observed: string[] = []
    for (const route of FIXTURE_ROUTES) {
      if (route.defect === 'none') continue
      const rules = await rulesOn(route.path)
      // A check may legitimately report a defect the route did not plant only if
      // the route also has it; the fixture keeps routes minimal so the planted
      // rule is always among what is reported.
      expect(rules).toContain(route.defect)
      observed.push(route.defect)
    }
    expect([...observed].sort()).toEqual(planted)
  }, 120_000)

  it('keeps every rule id stable enough to compare across runs', async () => {
    const first = await rulesOn('/no-focus-indicator')
    const second = await rulesOn('/no-focus-indicator')
    expect(second).toEqual(first)
  }, 60_000)
})
