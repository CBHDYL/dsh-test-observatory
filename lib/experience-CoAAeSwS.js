import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
//#region lib/types/experience/a11y.js
/**
* Accessibility scanning through axe-core. The library is injected into the
* page and run there, so the scan sees the same rendered DOM the user does;
* the result is mapped onto the report's violation vocabulary.
*
* axe reports, for every violation, the nodes that tripped it and a target
* selector for each. Those targets and their measured rectangles are kept, so a
* violation can be marked on a screenshot rather than only counted.
* @module @deepseek-ai/dsh-experience-runner/a11y
*/
/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = /* @__PURE__ */ new Set(["critical", "serious"]);
/** Longest visible-text excerpt kept on a node reference. */
const TEXT_LIMIT = 80;
/** Whether a run reports a structured axe payload. */
function asAxeReport(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const violations = value.violations;
	return Array.isArray(violations) ? value : void 0;
}
/** Whether a node's target is the observed selectors it claims to be. */
function targetsOf(node) {
	return Array.isArray(node.target) ? node.target.filter((entry) => typeof entry === "string") : [];
}
/** Whether the node's target is the nested selector list axe may report. */
function nestedTargetsOf(node) {
	return Array.isArray(node.target) ? node.target.filter((entry) => Array.isArray(entry)).flat() : [];
}
/** The first selector axe reported for a node, when it reported any. */
function selectorOf(node) {
	const flat = targetsOf(node);
	const nested = nestedTargetsOf(node);
	return flat[0] ?? nested[0] ?? void 0;
}
/** A readable tag name inferred from the node's markup. */
function tagOf(node, selector) {
	const fromHtml = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(node.html ?? "")?.[1];
	if (fromHtml !== void 0) return fromHtml.toLowerCase();
	return (/^([a-zA-Z][a-zA-Z0-9-]*)/.exec(selector ?? "")?.[1] ?? "element").toLowerCase();
}
/** The node's visible text, collapsed and truncated for display. */
function textOf(node) {
	const stripped = (node.html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
	if (stripped.length === 0) return void 0;
	return stripped.length > TEXT_LIMIT ? stripped.slice(0, TEXT_LIMIT) + "…" : stripped;
}
/** The element evidence for one axe node that reported a selector. */
function evidenceOf(node) {
	const selector = selectorOf(node);
	if (selector === void 0) return void 0;
	const text = textOf(node);
	return {
		element: {
			tag: tagOf(node, selector),
			selector,
			...text === void 0 ? {} : { text }
		},
		box: {
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			space: "viewport"
		}
	};
}
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
* @returns the violations, one per axe rule with the nodes that tripped it.
*/
async function checkAccessibility(page) {
	const source = await readFile(axePath(), "utf8");
	await page.addScriptTag({ content: source });
	const report = asAxeReport({ violations: await page.evaluate(async () => {
		return (await window.axe.run(document)).violations.map((violation) => ({
			id: violation.id,
			impact: violation.impact,
			help: violation.help,
			nodes: violation.nodes.map((node) => ({
				...node.target === void 0 ? {} : { target: node.target },
				...node.html === void 0 ? {} : { html: node.html }
			}))
		}));
	}) });
	if (report === void 0) throw new Error("axe-core returned no structured violations");
	return report.violations.map((violation) => {
		const evidence = violation.nodes.slice(0, 10).map(evidenceOf).filter((entry) => entry !== void 0);
		return {
			rule: "axe:" + violation.id,
			detail: violation.help + " (" + String(violation.nodes.length) + " node(s))",
			severity: violation.impact !== null && BLOCKING.has(violation.impact) ? "high" : "medium",
			evidence
		};
	});
}
//#endregion
//#region lib/types/experience/visual.js
/**
* Inspect one rendered document for objective visual defects. Self-contained by
* contract: it closes over nothing, so Playwright can serialize it into a page.
* @param root - the document to inspect.
* @returns the violations found, in rule order, each with its target geometry.
*/
function collectViolations(root) {
	const violations = [];
	const TEXT_LIMIT = 80;
	const cssEscape = (value) => {
		const escapeOne = (character) => /[a-zA-Z0-9_-]/.test(character) ? character : "\\" + character;
		return value.split("").map(escapeOne).join("");
	};
	const selectorOf = (element) => {
		if (element.id !== "") return "#" + cssEscape(element.id);
		const parts = [];
		let current = element;
		while (current !== null && (current.tagName ?? "html").toLowerCase() !== "html") {
			const tag = (current.tagName ?? "html").toLowerCase();
			const parent = current.parentElement;
			if (parent === null) {
				parts.unshift(tag);
				break;
			}
			const sameTag = Array.from(parent.children).filter((child) => child.tagName === current?.tagName);
			parts.unshift(sameTag.length > 1 ? tag + ":nth-of-type(" + String(sameTag.indexOf(current) + 1) + ")" : tag);
			current = parent;
		}
		return parts.join(" > ");
	};
	const textOf = (element) => {
		const raw = (element.textContent ?? "").replace(/\s+/g, " ").trim();
		if (raw.length === 0) return void 0;
		return raw.length > TEXT_LIMIT ? raw.slice(0, TEXT_LIMIT) + "…" : raw;
	};
	const describe = (element) => {
		const rect = element.getBoundingClientRect();
		const box = {
			x: Math.round(rect.left),
			y: Math.round(rect.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
			space: "viewport"
		};
		const text = textOf(element);
		return {
			element: {
				tag: (element.tagName ?? "html").toLowerCase(),
				selector: selectorOf(element),
				...text === void 0 ? {} : { text }
			},
			box
		};
	};
	const describeAll = (elements, limit) => elements.slice(0, limit).map(describe);
	/** Elements kept per finding, so one broken page cannot bloat the model. */
	const MAX_EVIDENCE = 10;
	const images = Array.from(root.querySelectorAll("img"));
	const broken = images.filter((image) => image.complete && image.naturalWidth === 0);
	if (broken.length > 0) {
		const source = broken[0]?.getAttribute("src");
		violations.push({
			rule: "image-broken",
			detail: String(broken.length) + " image(s) failed to load, first: " + (source === null || source === void 0 ? "(no src)" : source),
			severity: "high",
			evidence: describeAll(broken, MAX_EVIDENCE)
		});
	}
	const unlabelled = images.filter((image) => !image.hasAttribute("alt"));
	if (unlabelled.length > 0) violations.push({
		rule: "image-no-alt",
		detail: String(unlabelled.length) + " image(s) have no alt attribute",
		severity: "medium",
		evidence: describeAll(unlabelled, MAX_EVIDENCE)
	});
	const doc = root.documentElement;
	const overflow = doc.scrollWidth - doc.clientWidth;
	if (overflow > 2) violations.push({
		rule: "horizontal-overflow",
		detail: "page is " + String(overflow) + "px wider than the viewport",
		severity: "high",
		evidence: describeAll([doc], 1)
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
			severity: "medium",
			evidence: describeAll(outside, MAX_EVIDENCE)
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
		severity: "medium",
		evidence: describeAll(placeholderOnly, MAX_EVIDENCE)
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
* Wait, best effort, for the page to stop fetching. A page that never goes idle
* (a poller, a long-poll socket) proceeds after the deadline rather than failing.
* @param page - the page to settle.
*/
async function settle(page, timeoutMs) {
	await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => void 0);
}
/**
* Whether the page is the app under test rather than a browser error page.
* @param url - the page's current URL.
* @returns true when checks on this page describe the app.
*/
function isAppPage(url) {
	return url !== "about:blank" && !url.startsWith("chrome-error://");
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
async function runAction(page, action, capture, settleTimeoutMs) {
	switch (action.kind) {
		case "goto":
			await page.goto(action.url, { waitUntil: "load" });
			await settle(page, settleTimeoutMs);
			return;
		case "wait":
			if (action.selector !== void 0) await page.locator(action.selector).first().waitFor({ state: "visible" });
			else await page.waitForTimeout(action.ms ?? 500);
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
		case "screenshot": return capture(action.caption, action.category);
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
			steps.push({
				label: step.label,
				state: "BLOCKED",
				durationMs: 0,
				evidenceIds: []
			});
			continue;
		}
		const started = Date.now();
		const evidenceIds = [];
		let lastError;
		let settled = false;
		for (let attempt = 0; attempt <= retries && !settled; attempt++) try {
			for (const action of step.actions) {
				const evidenceId = await runAction(page, action, capture, settleTimeoutMs);
				if (evidenceId !== void 0) evidenceIds.push(evidenceId);
			}
			settled = true;
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		if (settled) steps.push({
			label: step.label,
			state: "PASS",
			durationMs: Date.now() - started,
			evidenceIds
		});
		else {
			try {
				const failureEvidenceId = await capture(step.label + " — failure", "fail");
				if (failureEvidenceId !== void 0) evidenceIds.push(failureEvidenceId);
			} catch {}
			steps.push({
				label: step.label,
				state: "FAIL",
				durationMs: Date.now() - started,
				evidenceIds,
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
	const settleTimeoutMs = options.settleTimeoutMs ?? 2e4;
	const browser = await launch(executable);
	try {
		const journeys = [];
		for (const spec of options.journeys) {
			if (options.signal?.aborted === true) throw new Error("experience run cancelled");
			const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
			const page = await browser.newPage({ viewport });
			const meta = [spec.device, String(viewport.width) + "x" + String(viewport.height)].join(" · ");
			let activeStepLabel = "";
			const capture = async (caption, category) => {
				const shot = await captureBounded(page);
				if (shot === void 0) return void 0;
				const id = "evidence-" + String(shots.length + 1);
				shots.push({
					id,
					caption,
					category,
					persona: spec.persona,
					journey: spec.name,
					stepLabel: activeStepLabel,
					meta,
					dataUri: shot
				});
				return id;
			};
			const journey = await runJourney(page, spec, async (caption, category) => capture(caption, category), retries, settleTimeoutMs, (label) => {
				activeStepLabel = label;
			});
			journeys.push(journey);
			if (options.visualChecks !== false || options.accessibilityChecks !== false) {
				await settle(page, settleTimeoutMs);
				const reachedApp = isAppPage(page.url());
				const visual = !reachedApp || options.visualChecks === false ? [] : await containCheck("visual", () => checkVisual(page));
				const accessibility = !reachedApp || options.accessibilityChecks === false ? [] : await containCheck("accessibility", () => checkAccessibility(page));
				const skipped = reachedApp ? [] : [{
					rule: "page-checks-skipped",
					detail: "the journey never reached the app (the page is " + page.url() + "), so page checks would describe the browser error page instead",
					severity: "medium"
				}];
				checks.push({
					persona: spec.persona,
					visual: [...skipped, ...visual],
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
