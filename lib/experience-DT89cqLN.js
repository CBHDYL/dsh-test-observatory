import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
//#region lib/types/experience/a11y.js
/**
* Accessibility scanning through axe-core. The library is injected into the
* page and run there, so the scan sees the same rendered DOM the user does;
* the result is mapped onto the report's violation vocabulary.
* @module @deepseek-ai/dsh-experience-runner/a11y
*/
/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = new Set(["critical", "serious"]);
/**
* Resolve the axe-core browser bundle path.
* @returns the absolute path of the axe source file.
*/
function axePath() {
	return createRequire(import.meta.url).resolve("axe-core/axe.min.js");
}
/**
* Run an axe-core scan over the page's current state.
* @param page - the page to scan.
* @returns the violations, one per axe rule with at least one node.
*/
async function checkAccessibility(page) {
	const source = await readFile(axePath(), "utf8");
	await page.addScriptTag({ content: source });
	return (await page.evaluate(async () => {
		return (await window.axe.run(document)).violations.map((violation) => ({
			id: violation.id,
			impact: violation.impact,
			help: violation.help,
			nodes: violation.nodes.length
		}));
	})).map((result) => ({
		rule: "axe:" + result.id,
		detail: result.help + " (" + String(result.nodes) + " node(s))",
		severity: result.impact !== null && BLOCKING.has(result.impact) ? "high" : "medium"
	}));
}
//#endregion
//#region lib/types/experience/visual.js
/**
* Deterministic visual checks over a live page. Every finding is a browser
* fact — a measurement, a failed request, a missing attribute — so the visual
* dimension of the score reproduces from the run rather than from an opinion.
*
* The inspection itself is a self-contained function: it is serialized into
* the page by Playwright, and unit-tested directly against a DOM.
* @module @deepseek-ai/dsh-experience-runner/visual
*/
/**
* Inspect one rendered document for objective visual defects. Self-contained by
* contract: it closes over nothing, so Playwright can serialize it into a page.
* @param root - the document to inspect.
* @returns the violations found, in rule order.
*/
function collectViolations(root) {
	const violations = [];
	const images = Array.from(root.querySelectorAll("img"));
	const broken = images.filter((image) => image.complete && image.naturalWidth === 0);
	if (broken.length > 0) {
		const source = broken[0]?.getAttribute("src");
		violations.push({
			rule: "image-broken",
			detail: String(broken.length) + " image(s) failed to load, first: " + (source === null || source === void 0 ? "(no src)" : source),
			severity: "high"
		});
	}
	const unlabelled = images.filter((image) => !image.hasAttribute("alt"));
	if (unlabelled.length > 0) violations.push({
		rule: "image-no-alt",
		detail: String(unlabelled.length) + " image(s) have no alt attribute",
		severity: "medium"
	});
	const doc = root.documentElement;
	const overflow = doc.scrollWidth - doc.clientWidth;
	if (overflow > 2) violations.push({
		rule: "horizontal-overflow",
		detail: "page is " + String(overflow) + "px wider than the viewport",
		severity: "high"
	});
	const viewport = root.defaultView;
	const viewportWidth = viewport === null ? 0 : viewport.innerWidth;
	const outside = Array.from(root.querySelectorAll("body *")).filter((element) => {
		const box = element.getBoundingClientRect();
		return box.width > 0 && box.right > viewportWidth + 2;
	});
	if (outside.length > 0) {
		const first = outside[0];
		violations.push({
			rule: "element-outside-viewport",
			detail: String(outside.length) + " element(s) extend past the viewport, first: " + (first?.tagName ?? ""),
			severity: "medium"
		});
	}
	const placeholderOnly = Array.from(root.querySelectorAll("input, textarea")).filter((field) => {
		const element = field;
		const hasLabel = element.labels !== null && element.labels.length > 0;
		const hasAria = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
		return element.hasAttribute("placeholder") && !hasLabel && !hasAria;
	});
	if (placeholderOnly.length > 0) violations.push({
		rule: "placeholder-only-field",
		detail: String(placeholderOnly.length) + " field(s) rely on a placeholder with no label",
		severity: "medium"
	});
	return violations;
}
/**
* Collect the visual violations of the page's current state.
* @param page - the page to measure.
* @returns the violations found, in rule order.
*/
async function checkVisual(page) {
	const evaluator = page;
	const expression = "(" + collectViolations.toString() + ")(document)";
	return evaluator.evaluate(expression);
}
//#endregion
//#region lib/types/experience/runner.js
/**
* Browser journey execution: drive one declared journey per persona through a
* real headless Chromium, settle every step, and capture the evidence the
* report shows. The launcher is a module seam so the runner is testable
* without a browser.
* @module @deepseek-ai/dsh-experience-runner/runner
*/
/** Default per-step deadline in milliseconds. */
const DEFAULT_STEP_TIMEOUT_MS = 15e3;
/** Default viewport for a journey that declares none. */
const DEFAULT_VIEWPORT = {
	width: 1440,
	height: 900
};
/** Bound on one captured screenshot's encoded size, so the report stays openable. */
const MAX_SHOT_BYTES = 4e5;
/**
* Capture the page within the report's size bound, degrading quality and then
* scale rather than dropping the evidence a human needs to judge the finding.
* @param page - the page to capture.
* @returns the data URI, or undefined when even the smallest capture exceeds the bound.
*/
async function captureBounded(page) {
	for (const attempt of [
		{ type: "png" },
		{
			type: "jpeg",
			quality: 70
		},
		{
			type: "jpeg",
			quality: 45
		},
		{
			type: "jpeg",
			quality: 25
		}
	]) {
		const options = { type: attempt.type };
		if (attempt.quality !== void 0) options.quality = attempt.quality;
		const buffer = await page.screenshot(options);
		if (buffer.byteLength <= 4e5) return "data:" + (attempt.type === "png" ? "image/png" : "image/jpeg") + ";base64," + buffer.toString("base64");
	}
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
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return [{
			rule: rule + "-check-failed",
			detail,
			severity: "medium"
		}];
	}
}
/**
* Default launcher: headless Chromium, with the executable resolved by the caller.
* @param executablePath - resolved executable, or undefined to let Playwright choose.
* @returns the launched browser.
*/
async function launchChromium(executablePath) {
	return chromium.launch({
		headless: true,
		...executablePath === void 0 ? {} : { executablePath }
	});
}
/**
* Resolve the Chromium executable the way the browser tool does, so one
* environment variable configures both.
* @returns the executable path, or undefined to let Playwright choose.
*/
function resolveExecutable() {
	const configured = process.env["DSH_BROWSER_EXECUTABLE"];
	return configured !== void 0 && configured.length > 0 ? configured : void 0;
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
		case "goto":
			await page.goto(action.url, { waitUntil: "domcontentloaded" });
			return;
		case "click":
			await page.click(action.selector);
			return;
		case "fill":
			await page.fill(action.selector, action.value);
			return;
		case "expectText":
			await page.getByText(action.text, { exact: false }).first().waitFor({ state: "visible" });
			return;
		case "expectVisible":
			await page.locator(action.selector).first().waitFor({ state: "visible" });
			return;
		case "screenshot":
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
			steps.push({
				label: step.label,
				state: "BLOCKED",
				durationMs: 0
			});
			continue;
		}
		const started = Date.now();
		let lastError;
		let settled = false;
		for (let attempt = 0; attempt <= retries && !settled; attempt++) try {
			for (const action of step.actions) await runAction(page, action, capture);
			settled = true;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		if (settled) steps.push({
			label: step.label,
			state: "PASS",
			durationMs: Date.now() - started
		});
		else {
			steps.push({
				label: step.label,
				state: "FAIL",
				durationMs: Date.now() - started,
				...lastError === void 0 ? {} : { error: lastError }
			});
			blocked = true;
		}
	}
	return {
		persona: spec.persona,
		device: spec.device,
		name: spec.name,
		steps,
		passed: steps.every((step) => step.state === "PASS")
	};
}
/**
* Drive every declared journey in a real browser and collect the evidence.
* The browser is always closed, including on cancellation.
* @param options - the declared journeys and the launcher seams.
* @returns the settled run.
*/
async function runExperience(options) {
	const launch = options.launch ?? launchChromium;
	const executable = (options.executable ?? resolveExecutable)();
	const shots = [];
	const checks = [];
	const retries = options.retries ?? 0;
	const browser = await launch(executable);
	try {
		const journeys = [];
		for (const spec of options.journeys) {
			if (options.signal?.aborted === true) throw new Error("experience run cancelled");
			const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
			const page = await browser.newPage({ viewport });
			const meta = [spec.device, String(viewport.width) + "x" + String(viewport.height)].join(" · ");
			const capture = async (caption, category) => {
				const shot = await captureBounded(page);
				if (shot === void 0) return;
				shots.push({
					caption,
					category,
					persona: spec.persona,
					meta,
					dataUri: shot
				});
			};
			const journey = await runJourney(page, spec, capture, retries);
			journeys.push(journey);
			if (options.visualChecks !== false || options.accessibilityChecks !== false) {
				const visual = options.visualChecks === false ? [] : await containCheck("visual", () => checkVisual(page));
				const accessibility = options.accessibilityChecks === false ? [] : await containCheck("accessibility", () => checkAccessibility(page));
				checks.push({
					persona: spec.persona,
					visual,
					accessibility
				});
			}
			await page.close();
		}
		return {
			journeys,
			shots,
			checks
		};
	} finally {
		await browser.close();
	}
}
//#endregion
//#region lib/types/experience/scoring.js
/**
* Rule-based experience scoring. The score is a transparent sum of weighted
* dimensions, so a reader can always reproduce it from the recorded outcomes;
* an AI narrative may explain a finding but never moves the number.
* @module @deepseek-ai/dsh-experience-runner/scoring
*/
/**
* The fixed dimension weights. Functionality dominates, then usability and the
* feedback a user gets while waiting; polish and accessibility share the rest.
*/
const SCORE_DIMENSIONS = [
	{
		label: "Functional completion",
		available: 30
	},
	{
		label: "Usability",
		available: 20
	},
	{
		label: "Visual quality",
		available: 15
	},
	{
		label: "Feedback & recovery",
		available: 15
	},
	{
		label: "Accessibility",
		available: 10
	},
	{
		label: "Perceived performance",
		available: 10
	}
];
/** Milliseconds above which a step counts as slow for perceived performance. */
const SLOW_STEP_MS = 5e3;
/**
* Qualitative band for a total score.
* @param total - the score 0-100.
* @returns the band label.
*/
function bandFor(total) {
	if (total >= 90) return "Excellent";
	if (total >= 80) return "Good · needs polish";
	if (total >= 60) return "Needs work";
	return "Blocked";
}
/**
* Count the failed or blocked steps across every journey.
* @param journeys - settled journeys.
* @returns the number of unsuccessful steps.
*/
function failedSteps(journeys) {
	return journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => step.state !== "PASS").length, 0);
}
/** Points lost per blocking visual violation. */
const VISUAL_HIGH_PENALTY = 5;
/** Points lost per non-blocking visual violation. */
const VISUAL_MEDIUM_PENALTY = 2;
/** Points lost per blocking accessibility violation. */
const A11Y_HIGH_PENALTY = 3;
/** Points lost per non-blocking accessibility violation. */
const A11Y_MEDIUM_PENALTY = 1;
/**
* Score one run by rule. Each dimension earns its full weight minus a penalty
* proportional to the failures that dimension can observe: functional
* completion looks at completed journeys, usability and feedback look at how
* steps settled, perceived performance at how long they took, and visual
* quality and accessibility at the violations the browser checks recorded.
* @param run - the settled run.
* @returns the rule-based score.
*/
function scoreRun(run) {
	const journeys = run.journeys;
	const tasksObserved = journeys.length;
	const tasksCompleted = journeys.filter((journey) => journey.passed).length;
	const blockers = tasksObserved - tasksCompleted;
	const failed = failedSteps(journeys);
	const totalSteps = journeys.reduce((sum, journey) => sum + journey.steps.length, 0);
	const completionRatio = tasksObserved === 0 ? 0 : tasksCompleted / tasksObserved;
	const stepRatio = totalSteps === 0 ? 1 : (totalSteps - failed) / totalSteps;
	const slow = journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => step.durationMs > SLOW_STEP_MS).length, 0);
	const speedRatio = totalSteps === 0 ? 1 : (totalSteps - slow) / totalSteps;
	const dedupe = (findings) => {
		const seen = /* @__PURE__ */ new Set();
		return findings.filter((finding) => {
			const key = finding.rule + "|" + finding.detail;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	};
	const visualFindings = dedupe(run.checks.flatMap((entry) => entry.visual));
	const a11yFindings = dedupe(run.checks.flatMap((entry) => entry.accessibility));
	const visualPenalty = visualFindings.reduce((sum, finding) => sum + (finding.severity === "high" ? VISUAL_HIGH_PENALTY : VISUAL_MEDIUM_PENALTY), 0);
	const a11yPenalty = a11yFindings.reduce((sum, finding) => sum + (finding.severity === "high" ? A11Y_HIGH_PENALTY : A11Y_MEDIUM_PENALTY), 0);
	const earned = {
		"Functional completion": 30 * completionRatio,
		Usability: 20 * stepRatio,
		"Visual quality": Math.max(0, 15 - visualPenalty),
		"Feedback & recovery": 15 * stepRatio,
		Accessibility: Math.max(0, 10 - a11yPenalty),
		"Perceived performance": 10 * speedRatio
	};
	const dimensions = SCORE_DIMENSIONS.map((spec) => ({
		label: spec.label,
		earned: Math.round(earned[spec.label] * 10) / 10,
		available: spec.available
	}));
	const total = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.earned, 0));
	return {
		total,
		band: bandFor(total),
		tasksObserved,
		tasksCompleted,
		blockers,
		recoverablePoints: Math.round((100 - total) * 10) / 10,
		dimensions,
		visualFindings: visualFindings.length,
		accessibilityFindings: a11yFindings.length
	};
}
//#endregion
//#region lib/types/experience/index.js
var experience_exports = /* @__PURE__ */ __exportAll({
	DEFAULT_STEP_TIMEOUT_MS: () => DEFAULT_STEP_TIMEOUT_MS,
	DEFAULT_VIEWPORT: () => DEFAULT_VIEWPORT,
	MAX_SHOT_BYTES: () => MAX_SHOT_BYTES,
	SCORE_DIMENSIONS: () => SCORE_DIMENSIONS,
	SLOW_STEP_MS: () => SLOW_STEP_MS,
	bandFor: () => bandFor,
	checkAccessibility: () => checkAccessibility,
	checkVisual: () => checkVisual,
	collectViolations: () => collectViolations,
	launchChromium: () => launchChromium,
	resolveExecutable: () => resolveExecutable,
	runExperience: () => runExperience,
	scoreRun: () => scoreRun
});
//#endregion
export { scoreRun as a, MAX_SHOT_BYTES as c, runExperience as d, checkVisual as f, bandFor as i, launchChromium as l, checkAccessibility as m, SCORE_DIMENSIONS as n, DEFAULT_STEP_TIMEOUT_MS as o, collectViolations as p, SLOW_STEP_MS as r, DEFAULT_VIEWPORT as s, experience_exports as t, resolveExecutable as u };
