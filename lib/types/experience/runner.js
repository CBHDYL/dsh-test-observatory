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
async function runAction(page, action, capture) {
    switch (action.kind) {
        case 'goto':
            await page.goto(action.url, { waitUntil: 'domcontentloaded' });
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
            await capture(action.caption, action.category);
            return;
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
async function runJourney(page, spec, capture, retries) {
    const steps = [];
    let blocked = false;
    for (const step of spec.steps) {
        if (blocked) {
            steps.push({ label: step.label, state: 'BLOCKED', durationMs: 0 });
            continue;
        }
        const started = Date.now();
        let lastError;
        let settled = false;
        for (let attempt = 0; attempt <= retries && !settled; attempt++) {
            try {
                for (const action of step.actions)
                    await runAction(page, action, capture);
                settled = true;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
            }
        }
        if (settled) {
            steps.push({ label: step.label, state: 'PASS', durationMs: Date.now() - started });
        }
        else {
            steps.push({ label: step.label, state: 'FAIL', durationMs: Date.now() - started, ...(lastError === undefined ? {} : { error: lastError }) });
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
    const browser = await launch(executable);
    try {
        const journeys = [];
        for (const spec of options.journeys) {
            if (options.signal?.aborted === true)
                throw new Error('experience run cancelled');
            const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
            const page = await browser.newPage({ viewport });
            const meta = [spec.device, String(viewport.width) + 'x' + String(viewport.height)].join(' · ');
            const capture = async (caption, category) => {
                const shot = await captureBounded(page);
                if (shot === undefined)
                    return;
                shots.push({
                    caption,
                    category,
                    persona: spec.persona,
                    meta,
                    dataUri: shot,
                });
            };
            const journey = await runJourney(page, spec, capture, retries);
            journeys.push(journey);
            if (options.visualChecks !== false || options.accessibilityChecks !== false) {
                const visual = options.visualChecks === false ? [] : await checkVisual(page);
                const accessibility = options.accessibilityChecks === false ? [] : await checkAccessibility(page);
                checks.push({ persona: spec.persona, visual: visual, accessibility: accessibility });
            }
            await page.close();
        }
        return { journeys, shots, checks };
    }
    finally {
        await browser.close();
    }
}
