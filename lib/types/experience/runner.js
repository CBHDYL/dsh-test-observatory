/**
 * Browser journey execution: drive one declared journey per persona through a
 * real headless Chromium, settle every step, and capture the evidence the
 * report shows. The launcher is a module seam so the runner is testable
 * without a browser.
 * @module @deepseek-ai/dsh-experience-runner/runner
 */
import { chromium } from 'playwright-core';
import { checkAccessibility } from "./a11y.js";
import { checkVisual } from "./visual.js";
/** Deadline for the best-effort wait before page checks run. */
export const SETTLE_TIMEOUT_MS = 20000;
/** Default settle time for a `wait` action that names no selector. */
export const DEFAULT_WAIT_MS = 500;
/** Default per-step deadline in milliseconds. */
export const DEFAULT_STEP_TIMEOUT_MS = 15000;
/** Default viewport for a journey that declares none. */
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
/** Bound on one captured screenshot's encoded size, so the report stays openable. */
export const MAX_SHOT_BYTES = 400_000;
/**
 * Capture the page within the report's size bound, degrading quality and then
 * scale rather than dropping the evidence a human needs to judge the finding.
 * @param page - the page to capture.
 * @returns the data URI, or undefined when even the smallest capture exceeds the bound.
 */
async function captureBounded(page) {
    const attempts = [
        { type: 'png' },
        { type: 'jpeg', quality: 70 },
        { type: 'jpeg', quality: 45 },
        { type: 'jpeg', quality: 25 },
    ];
    for (const attempt of attempts) {
        const options = { type: attempt.type };
        if (attempt.quality !== undefined)
            options.quality = attempt.quality;
        const buffer = await page.screenshot(options);
        if (buffer.byteLength <= MAX_SHOT_BYTES) {
            const mime = attempt.type === 'png' ? 'image/png' : 'image/jpeg';
            return 'data:' + mime + ';base64,' + buffer.toString('base64');
        }
    }
    return undefined;
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
async function containCheck(rule, check) {
    try {
        return await check();
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return [{ rule: rule + '-check-failed', detail, severity: 'medium' }];
    }
}
/**
 * Wait, best effort, for the page to stop fetching. A page that never goes idle
 * (a poller, a long-poll socket) proceeds after the deadline rather than failing.
 * @param page - the page to settle.
 */
async function settle(page, timeoutMs) {
    await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => undefined);
}
/**
 * Whether the page is the app under test rather than a browser error page.
 * @param url - the page's current URL.
 * @returns true when checks on this page describe the app.
 */
function isAppPage(url) {
    return url !== 'about:blank' && !url.startsWith('chrome-error://');
}
/**
 * Default launcher: headless Chromium, with the executable resolved by the caller.
 * @param executablePath - resolved executable, or undefined to let Playwright choose.
 * @returns the launched browser.
 */
export async function launchChromium(executablePath) {
    return chromium.launch({ headless: true, ...(executablePath === undefined ? {} : { executablePath }) });
}
/**
 * Resolve the Chromium executable the way the browser tool does, so one
 * environment variable configures both.
 * @returns the executable path, or undefined to let Playwright choose.
 */
export function resolveExecutable() {
    const configured = process.env['DSH_BROWSER_EXECUTABLE'];
    return configured !== undefined && configured.length > 0 ? configured : undefined;
}
/**
 * Run one action against a page.
 * @param page - the journey's page.
 * @param action - the declared action.
 * @param capture - captures a screenshot and records it.
 * @param context - caption/meta inputs for a screenshot action.
 * @returns a promise that settles when the action is satisfied.
 */
async function runAction(page, action, capture, settleTimeoutMs) {
    switch (action.kind) {
        case 'goto':
            // 'load' rather than 'domcontentloaded': a client-rendered page keeps
            // painting after the DOM is ready, and a capture or check taken then
            // describes a half-built screen. The settle that follows lets the page's
            // own data requests finish before anything reads it.
            await page.goto(action.url, { waitUntil: 'load' });
            await settle(page, settleTimeoutMs);
            return;
        case 'wait':
            if (action.selector !== undefined) {
                await page.locator(action.selector).first().waitFor({ state: 'visible' });
            }
            else {
                await page.waitForTimeout(action.ms ?? DEFAULT_WAIT_MS);
            }
            return;
        case 'click':
            await page.click(action.selector);
            return;
        case 'fill':
            await page.fill(action.selector, action.value);
            return;
        case 'expectText':
            await page.getByText(action.text, { exact: false }).first().waitFor({ state: 'visible' });
            return;
        case 'expectVisible':
            await page.locator(action.selector).first().waitFor({ state: 'visible' });
            return;
        case 'screenshot':
            return capture(action.caption, action.category);
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
async function runJourney(page, spec, capture, retries, settleTimeoutMs, setActiveStep) {
    const steps = [];
    let blocked = false;
    for (const step of spec.steps) {
        setActiveStep(step.label);
        if (blocked) {
            steps.push({ label: step.label, state: 'BLOCKED', durationMs: 0, evidenceIds: [] });
            continue;
        }
        const started = Date.now();
        const evidenceIds = [];
        let lastError;
        let settled = false;
        for (let attempt = 0; attempt <= retries && !settled; attempt++) {
            try {
                for (const action of step.actions) {
                    const evidenceId = await runAction(page, action, capture, settleTimeoutMs);
                    if (evidenceId !== undefined)
                        evidenceIds.push(evidenceId);
                }
                settled = true;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        if (settled) {
            steps.push({ label: step.label, state: 'PASS', durationMs: Date.now() - started, evidenceIds });
        }
        else {
            try {
                const failureEvidenceId = await capture(step.label + ' — failure', 'fail');
                if (failureEvidenceId !== undefined)
                    evidenceIds.push(failureEvidenceId);
            }
            catch {
                // The failed step remains the primary evidence when the page cannot be captured.
            }
            steps.push({ label: step.label, state: 'FAIL', durationMs: Date.now() - started, evidenceIds, ...(lastError === undefined ? {} : { error: lastError }) });
            blocked = true;
        }
    }
    return {
        persona: spec.persona,
        device: spec.device,
        name: spec.name,
        steps,
        passed: steps.every(step => step.state === 'PASS'),
    };
}
/**
 * Drive every declared journey in a real browser and collect the evidence.
 * The browser is always closed, including on cancellation.
 * @param options - the declared journeys and the launcher seams.
 * @returns the settled run.
 */
export async function runExperience(options) {
    const launch = options.launch ?? launchChromium;
    const executable = (options.executable ?? resolveExecutable)();
    const shots = [];
    const checks = [];
    const retries = options.retries ?? 0;
    const settleTimeoutMs = options.settleTimeoutMs ?? SETTLE_TIMEOUT_MS;
    const browser = await launch(executable);
    try {
        const journeys = [];
        for (const spec of options.journeys) {
            if (options.signal?.aborted === true)
                throw new Error('experience run cancelled');
            const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
            const page = await browser.newPage({ viewport });
            const meta = [spec.device, String(viewport.width) + 'x' + String(viewport.height)].join(' · ');
            let activeStepLabel = '';
            const capture = async (caption, category) => {
                const shot = await captureBounded(page);
                if (shot === undefined)
                    return undefined;
                const id = 'evidence-' + String(shots.length + 1);
                shots.push({ id, caption, category, persona: spec.persona, journey: spec.name, stepLabel: activeStepLabel, meta, dataUri: shot });
                return id;
            };
            const journey = await runJourney(page, spec, async (caption, category) => capture(caption, category), retries, settleTimeoutMs, label => { activeStepLabel = label; });
            journeys.push(journey);
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
                await settle(page, settleTimeoutMs);
                const reachedApp = isAppPage(page.url());
                const visual = !reachedApp || options.visualChecks === false
                    ? []
                    : await containCheck('visual', () => checkVisual(page));
                const accessibility = !reachedApp || options.accessibilityChecks === false
                    ? []
                    : await containCheck('accessibility', () => checkAccessibility(page));
                const skipped = reachedApp
                    ? []
                    : [{
                            rule: 'page-checks-skipped',
                            detail: 'the journey never reached the app (the page is ' + page.url() + '), so page checks would describe the browser error page instead',
                            severity: 'medium',
                        }];
                checks.push({ persona: spec.persona, visual: [...skipped, ...visual], accessibility });
            }
            await page.close();
        }
        return { journeys, shots, checks };
    }
    finally {
        await browser.close();
    }
}
