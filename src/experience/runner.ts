/**
 * Browser journey execution: drive one declared journey per persona through a
 * real headless Chromium, settle every step, and capture the evidence the
 * report shows. The launcher is a module seam so the runner is testable
 * without a browser.
 * @module @deepseek-ai/dsh-experience-runner/runner
 */

import { chromium, type Browser, type Page } from 'playwright-core'
import type { CapturedShot, CheckFinding, ExperienceRun, JourneyAction, JourneyChecks, JourneyOutcome, JourneySpec, StepOutcome } from './types.ts'
import { checkAccessibility } from './a11y.ts'
import { checkVisual } from './visual.ts'

/** Default per-step deadline in milliseconds. */
export const DEFAULT_STEP_TIMEOUT_MS = 15000

/** Default viewport for a journey that declares none. */
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 } as const

/** Bound on one captured screenshot's encoded size, so the report stays openable. */
export const MAX_SHOT_BYTES = 400_000

/**
 * Capture the page within the report's size bound, degrading quality and then
 * scale rather than dropping the evidence a human needs to judge the finding.
 * @param page - the page to capture.
 * @returns the data URI, or undefined when even the smallest capture exceeds the bound.
 */
async function captureBounded(page: Page): Promise<string | undefined> {
  const attempts: readonly { type: 'png' | 'jpeg'; quality?: number }[] = [
    { type: 'png' },
    { type: 'jpeg', quality: 70 },
    { type: 'jpeg', quality: 45 },
    { type: 'jpeg', quality: 25 },
  ]
  for (const attempt of attempts) {
    const options: { type: 'png' | 'jpeg'; quality?: number } = { type: attempt.type }
    if (attempt.quality !== undefined) options.quality = attempt.quality
    const buffer = await page.screenshot(options)
    if (buffer.byteLength <= MAX_SHOT_BYTES) {
      const mime = attempt.type === 'png' ? 'image/png' : 'image/jpeg'
      return 'data:' + mime + ';base64,' + buffer.toString('base64')
    }
  }
  return undefined
}

/**
 * Run one page check, turning any failure into a single finding. A check that
 * cannot read the page (a navigation destroyed its context, the page closed, the
 * scanner is missing) is reported as an observation, not thrown: the journey
 * result is the primary evidence and must survive a secondary check failing.
 * @param rule - the rule id reported for a failed check.
 * @param check - the check to run.
 * @returns the findings, or one finding describing why the check could not run.
 */
async function containCheck(
  rule: string,
  check: () => Promise<readonly CheckFinding[]>,
): Promise<readonly CheckFinding[]> {
  try {
    return await check()
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error)
    return [{ rule: rule + '-check-failed', detail, severity: 'medium' }]
  }
}

/**
 * Whether the page is the app under test rather than a browser error page.
 * @param url - the page's current URL.
 * @returns true when checks on this page describe the app.
 */
function isAppPage(url: string): boolean {
  return url !== 'about:blank' && !url.startsWith('chrome-error://')
}

/** Browser launcher seam. */
export type BrowserLauncher = (executablePath: string | undefined) => Promise<Browser>

/**
 * Default launcher: headless Chromium, with the executable resolved by the caller.
 * @param executablePath - resolved executable, or undefined to let Playwright choose.
 * @returns the launched browser.
 */
export async function launchChromium(executablePath: string | undefined): Promise<Browser> {
  return chromium.launch({ headless: true, ...(executablePath === undefined ? {} : { executablePath }) })
}

/**
 * Resolve the Chromium executable the way the browser tool does, so one
 * environment variable configures both.
 * @returns the executable path, or undefined to let Playwright choose.
 */
export function resolveExecutable(): string | undefined {
  const configured = process.env['DSH_BROWSER_EXECUTABLE']
  return configured !== undefined && configured.length > 0 ? configured : undefined
}

/**
 * Run one action against a page.
 * @param page - the journey's page.
 * @param action - the declared action.
 * @param capture - captures a screenshot and records it.
 * @param context - caption/meta inputs for a screenshot action.
 * @returns a promise that settles when the action is satisfied.
 */
async function runAction(
  page: Page,
  action: JourneyAction,
  capture: (caption: string, category: CapturedShot['category']) => Promise<void>,
): Promise<void> {
  switch (action.kind) {
    case 'goto':
      await page.goto(action.url, { waitUntil: 'domcontentloaded' })
      return
    case 'click':
      await page.click(action.selector)
      return
    case 'fill':
      await page.fill(action.selector, action.value)
      return
    case 'expectText':
      await page.getByText(action.text, { exact: false }).first().waitFor({ state: 'visible' })
      return
    case 'expectVisible':
      await page.locator(action.selector).first().waitFor({ state: 'visible' })
      return
    case 'screenshot':
      await capture(action.caption, action.category)
      return
  }
}

/**
 * Execute one declared journey and settle every step.
 * @param page - the page to drive.
 * @param spec - the declared journey.
 * @param persona - the persona name recorded on captures.
 * @param capture - screenshot sink.
 * @returns the settled journey.
 */
async function runJourney(
  page: Page,
  spec: JourneySpec,
  capture: (caption: string, category: CapturedShot['category']) => Promise<void>,
  retries: number,
): Promise<JourneyOutcome> {
  const steps: StepOutcome[] = []
  let blocked = false
  for (const step of spec.steps) {
    if (blocked) {
      steps.push({ label: step.label, state: 'BLOCKED', durationMs: 0 })
      continue
    }
    const started = Date.now()
    let lastError: string | undefined
    let settled = false
    for (let attempt = 0; attempt <= retries && !settled; attempt++) {
      try {
        for (const action of step.actions) await runAction(page, action, capture)
        settled = true
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
    if (settled) {
      steps.push({ label: step.label, state: 'PASS', durationMs: Date.now() - started })
    } else {
      steps.push({ label: step.label, state: 'FAIL', durationMs: Date.now() - started, ...(lastError === undefined ? {} : { error: lastError }) })
      blocked = true
    }
  }
  return {
    persona: spec.persona,
    device: spec.device,
    name: spec.name,
    steps,
    passed: steps.every(step => step.state === 'PASS'),
  }
}

/** Options of {@link runExperience}. */
export interface RunOptions {
  /** The declared journeys. */
  readonly journeys: readonly JourneySpec[]
  /** Browser launcher seam (defaults to headless Chromium). */
  readonly launch?: BrowserLauncher
  /** Executable resolver seam (defaults to {@link resolveExecutable}). */
  readonly executable?: () => string | undefined
  /** Caller cancellation. */
  readonly signal?: AbortSignal
  /** Whether to run the deterministic visual checks (default true). */
  readonly visualChecks?: boolean
  /** Whether to run the axe-core accessibility scan (default true). */
  readonly accessibilityChecks?: boolean
  /** Extra attempts per failed step (default 0). */
  readonly retries?: number
}

/**
 * Drive every declared journey in a real browser and collect the evidence.
 * The browser is always closed, including on cancellation.
 * @param options - the declared journeys and the launcher seams.
 * @returns the settled run.
 */
export async function runExperience(options: RunOptions): Promise<ExperienceRun> {
  const launch = options.launch ?? launchChromium
  const executable = (options.executable ?? resolveExecutable)()
  const shots: CapturedShot[] = []
  const checks: JourneyChecks[] = []
  const retries = options.retries ?? 0
  const browser = await launch(executable)
  try {
    const journeys: JourneyOutcome[] = []
    for (const spec of options.journeys) {
      if (options.signal?.aborted === true) throw new Error('experience run cancelled')
      const viewport = spec.viewport ?? DEFAULT_VIEWPORT
      const page = await browser.newPage({ viewport })
      const meta = [spec.device, String(viewport.width) + 'x' + String(viewport.height)].join(' · ')
      const capture = async (caption: string, category: CapturedShot['category']): Promise<void> => {
        const shot = await captureBounded(page)
        if (shot === undefined) return
        shots.push({
          caption,
          category,
          persona: spec.persona,
          meta,
          dataUri: shot,
        })
      }
      const journey = await runJourney(page, spec, capture, retries)
      journeys.push(journey)
      if (options.visualChecks !== false || options.accessibilityChecks !== false) {
        // A check reads the page after the journey; if the page is still moving,
        // the read can lose its execution context. That is a fact about the
        // check, never a reason to fail the whole run, so each check is
        // contained and reports its own failure as a finding.
        //
        // A page that never reached the app (the navigation failed and the
        // browser is showing its own error page) is not evidence about the app,
        // so its checks are skipped rather than reported as app defects.
        const reachedApp = isAppPage(page.url())
        const visual = !reachedApp || options.visualChecks === false
          ? []
          : await containCheck('visual', () => checkVisual(page))
        const accessibility = !reachedApp || options.accessibilityChecks === false
          ? []
          : await containCheck('accessibility', () => checkAccessibility(page))
        const skipped: readonly CheckFinding[] = reachedApp
          ? []
          : [{
            rule: 'page-checks-skipped',
            detail: 'the journey never reached the app (the page is ' + page.url() + '), so page checks would describe the browser error page instead',
            severity: 'medium',
          }]
        checks.push({ persona: spec.persona, visual: [...skipped, ...visual], accessibility })
      }
      await page.close()
    }
    return { journeys, shots, checks }
  } finally {
    await browser.close()
  }
}