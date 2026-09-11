/**
 * Browser journey execution: drive one declared journey per persona through a
 * real headless Chromium, settle every step, and capture the evidence the
 * report shows. The launcher is a module seam so the runner is testable
 * without a browser.
 * @module @deepseek-ai/dsh-experience-runner/runner
 */

import { chromium, type Browser, type Page } from 'playwright-core'
import type { CapturedShot, CheckFinding, ExperienceRun, JourneyAction, JourneyChecks, JourneyOutcome, JourneySpec, StepOutcome } from './types.ts'
import type { PersonaBehavior } from './behavior/types.ts'
import { checkAccessibility } from './a11y.ts'
import { checkKeyboard, probeOpenDialog } from './keyboard-checks.ts'
import { applyEnvironment } from './behavior/environment.ts'
import { behaviorDimensions, resolveBehavior } from './behavior/index.ts'
import { MAX_SHOT_BYTES as MAX_SHOT_BYTES_LIMIT, captureEvidence } from './capture.ts'
import type { Annotation } from './annotate.ts'
import { checkVisual } from './visual.ts'

/** Deadline for the best-effort wait before page checks run. */
export const SETTLE_TIMEOUT_MS = 20000

/** Default settle time for a `wait` action that names no selector. */
export const DEFAULT_WAIT_MS = 500

/** Default per-step deadline in milliseconds. */
export const DEFAULT_STEP_TIMEOUT_MS = 15000

/** Default viewport for a journey that declares none. */
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 } as const

/** Bound on one captured screenshot's encoded size, so the report stays openable. */
export { MAX_SHOT_BYTES_LIMIT as MAX_SHOT_BYTES }

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
 * Wait, best effort, for the page to stop fetching. A page that never goes idle
 * (a poller, a long-poll socket) proceeds after the deadline rather than failing.
 * @param page - the page to settle.
 */
async function settle(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined)
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
  capture: (caption: string, category: CapturedShot['category']) => Promise<string | undefined>,
  settleTimeoutMs: number,
): Promise<string | undefined> {
  switch (action.kind) {
    case 'goto':
      // 'load' rather than 'domcontentloaded': a client-rendered page keeps
      // painting after the DOM is ready, and a capture or check taken then
      // describes a half-built screen. The settle that follows lets the page's
      // own data requests finish before anything reads it.
      await page.goto(action.url, { waitUntil: 'load' })
      await settle(page, settleTimeoutMs)
      return
    case 'wait':
      if (action.selector !== undefined) {
        await page.locator(action.selector).first().waitFor({ state: 'visible' })
      } else {
        await page.waitForTimeout(action.ms ?? DEFAULT_WAIT_MS)
      }
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
      return capture(action.caption, action.category)
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
  capture: (caption: string, category: CapturedShot['category']) => Promise<string | undefined>,
  retries: number,
  settleTimeoutMs: number,
  setActiveStep: (label: string) => void,
  behavior: PersonaBehavior,
  appliedEnvironment: readonly string[],
): Promise<JourneyOutcome> {
  const steps: StepOutcome[] = []
  let blocked = false
  for (const step of spec.steps) {
    setActiveStep(step.label)
    if (blocked) {
      steps.push({ label: step.label, state: 'BLOCKED', durationMs: 0, evidenceIds: [] })
      continue
    }
    const started = Date.now()
    const evidenceIds: string[] = []
    let lastError: string | undefined
    let settled = false
    for (let attempt = 0; attempt <= retries && !settled; attempt++) {
      try {
        for (const action of step.actions) {
          const evidenceId = await runAction(page, action, capture, settleTimeoutMs)
          if (evidenceId !== undefined) evidenceIds.push(evidenceId)
        }
        settled = true
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : String(error)
      }
    }
    if (settled) {
      steps.push({ label: step.label, state: 'PASS', durationMs: Date.now() - started, evidenceIds })
    } else {
      try {
        const failureEvidenceId = await capture(step.label + ' — failure', 'fail')
        if (failureEvidenceId !== undefined) evidenceIds.push(failureEvidenceId)
      } catch {
        // The failed step remains the primary evidence when the page cannot be captured.
      }
      steps.push({ label: step.label, state: 'FAIL', durationMs: Date.now() - started, evidenceIds, ...(lastError === undefined ? {} : { error: lastError }) })
      blocked = true
    }
  }
  return {
    persona: spec.persona,
    device: spec.device,
    name: spec.name,
    steps,
    passed: steps.every(step => step.state === 'PASS'),
    behavior,
    behaviorDimensions: behaviorDimensions(behavior),
    ...(appliedEnvironment.length === 0 ? {} : { appliedEnvironment }),
  }
}

/**
 * Draw the measured finding regions onto the journey's most recent capture.
 *
 * The clean image is kept exactly as captured; only the marked copy is added, so
 * a reader can always compare a mark against the page as it rendered. A capture
 * that cannot be marked, or whose markings fail the integrity audit, keeps the
 * defects it reported and is shown as unverified rather than silently.
 * @param page - the journey's page, still open.
 * @param shots - every capture recorded so far, mutated in place.
 * @param findings - the check findings whose regions may be drawn.
 * @param masks - dynamic regions hidden for the capture.
 */
async function markLastCapture(
  page: Page,
  shots: CapturedShot[],
  findings: readonly CheckFinding[],
  masks: readonly string[],
): Promise<void> {
  const annotations: Annotation[] = []
  for (const [index, finding] of findings.entries()) {
    for (const measured of finding.evidence ?? []) {
      annotations.push({
        label: String(index + 1) + ' ' + finding.rule,
        severity: finding.severity,
        evidence: measured,
      })
    }
  }
  if (annotations.length === 0) return
  const target = shots.at(-1)
  if (target === undefined) return
  const result = await captureEvidence(page, annotations, masks)
  if (result.clean === undefined) return
  const marked = result.annotated === undefined ? {} : { annotatedDataUri: result.annotated }
  const defects = result.defects.length === 0 ? {} : { integrityDefects: result.defects }
  shots[shots.length - 1] = { ...target, ...marked, ...defects }
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
  /** Whether to run the keyboard barrier checks (default true). */
  readonly keyboardChecks?: boolean
  /** Extra attempts per failed step (default 0). */
  readonly retries?: number
  /**
   * Deadline for the best-effort wait after navigation and before page checks
   * (default {@link SETTLE_TIMEOUT_MS}). A client-rendered page that fetches its
   * data after load needs this long enough to reach its real screen.
   */
  readonly settleTimeoutMs?: number
  /**
   * Selectors of dynamic regions hidden for every capture. A timestamp or a live
   * counter changes between runs, so a capture containing one cannot be compared
   * with any later capture (default none).
   */
  readonly masks?: readonly string[]
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
  const settleTimeoutMs = options.settleTimeoutMs ?? SETTLE_TIMEOUT_MS
  const masks = options.masks ?? []
  const browser = await launch(executable)
  try {
    const journeys: JourneyOutcome[] = []
    for (const spec of options.journeys) {
      if (options.signal?.aborted === true) throw new Error('experience run cancelled')
      const viewport = spec.viewport ?? DEFAULT_VIEWPORT
      const behavior = resolveBehavior(spec.behavior)
      const page = await browser.newPage({ viewport })
      // Conditions belong to this page only, and are lifted before it closes.
      const environment = await applyEnvironment(page, behavior.environment)
      const meta = [spec.device, String(viewport.width) + 'x' + String(viewport.height)].join(' · ')
      let activeStepLabel = ''
      const capture = async (caption: string, category: CapturedShot['category']): Promise<string | undefined> => {
        const result = await captureEvidence(page, [], masks)
        if (result.clean === undefined) return undefined
        const id = 'evidence-' + String(shots.length + 1)
        shots.push({
          id,
          caption,
          category,
          persona: spec.persona,
          journey: spec.name,
          stepLabel: activeStepLabel,
          meta,
          dataUri: result.clean,
          ...(result.annotated === undefined ? {} : { annotatedDataUri: result.annotated }),
          ...(result.defects.length === 0 ? {} : { integrityDefects: result.defects }),
        })
        return id
      }
      let journey: JourneyOutcome
      try {
        journey = await runJourney(page, spec, async (caption, category) => capture(caption, category), retries, settleTimeoutMs, label => { activeStepLabel = label }, behavior, environment.applied)
      } finally {
        await environment.restore()
      }
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
        // Let in-flight requests finish before reading the page, so the checks
        // describe the screen the user would actually see. Best effort: a page
        // that keeps polling reaches the same checks on the next run.
        await settle(page, settleTimeoutMs)
        const reachedApp = isAppPage(page.url())
        const visual = !reachedApp || options.visualChecks === false
          ? []
          : await containCheck('visual', () => checkVisual(page))
        const accessibility = !reachedApp || options.accessibilityChecks === false
          ? []
          : await containCheck('accessibility', () => checkAccessibility(page))
        // Keyboard barriers need real key events, so the dialog probe runs here
        // rather than inside a single page evaluation.
        const keyboard = !reachedApp || options.keyboardChecks === false
          ? []
          : await containCheck('keyboard', async () => [...await checkKeyboard(page), ...await probeOpenDialog(page)])
        const skipped: readonly CheckFinding[] = reachedApp
          ? []
          : [{
            rule: 'page-checks-skipped',
            detail: 'the journey never reached the app (the page is ' + page.url() + '), so page checks would describe the browser error page instead',
            severity: 'medium',
          }]
        const findings = [...skipped, ...visual, ...accessibility, ...keyboard]
        checks.push({ persona: spec.persona, visual: [...skipped, ...visual], accessibility, keyboard })
        // Mark the regions the checks measured on the journey's last capture.
        // The annotations come from findings that only exist once the checks have
        // run, so this is the first moment they can be drawn; the page is still
        // open and unmasked, so the marks land where the checks measured them.
        await markLastCapture(page, shots, findings, masks)
      }
      await page.close()
    }
    return { journeys, shots, checks }
  } finally {
    await browser.close()
  }
}