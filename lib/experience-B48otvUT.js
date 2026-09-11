import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
//#region lib/types/experience/a11y.js
/**
* Accessibility scanning through axe-core. The library is injected into the
* page and run there, so the scan sees the same rendered DOM the user does;
* the result is mapped onto the report's violation vocabulary.
*
* axe reports, for every violation, the nodes that tripped it and a target
* selector for each. Those targets and their measured rectangles are kept, so a
* violation can be marked on a screenshot rather than only counted.
* @module @cbhdyl/dsh-test-observatory/experience/a11y
*/
/** Accessibility impact levels axe reports that block a task or degrade it. */
const BLOCKING = /* @__PURE__ */ new Set(["critical", "serious"]);
/** Longest visible-text excerpt kept on a node reference. */
const TEXT_LIMIT$1 = 80;
/** Whether a run reports a structured axe payload.
* @param value - the value an in-page run returned.
* @returns the report, or undefined when the value is not one.
*/
function asAxeReport(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const violations = value.violations;
	return Array.isArray(violations) ? value : void 0;
}
/** The selectors a node's target reports, ignoring the nested form.
* @param node - the axe node.
* @returns the flat selectors, in reported order.
*/
function targetsOf(node) {
	return Array.isArray(node.target) ? node.target.filter((entry) => typeof entry === "string") : [];
}
/** The selectors from the nested target form axe may report.
* @param node - the axe node.
* @returns the nested selectors, flattened, in reported order.
*/
function nestedTargetsOf(node) {
	return Array.isArray(node.target) ? node.target.filter((entry) => Array.isArray(entry)).flat() : [];
}
/** The first selector axe reported for a node, preferring the flat form.
* @param node - the axe node.
* @returns the selector, or undefined when the node reported none.
*/
function selectorOf(node) {
	const flat = targetsOf(node);
	const nested = nestedTargetsOf(node);
	return flat[0] ?? nested[0] ?? void 0;
}
/** A readable tag name inferred from the node's markup, then its selector.
* @param node - the axe node.
* @param selector - the selector already derived for the node.
* @returns a lowercase tag name, or `element` when neither source names one.
*/
function tagOf(node, selector) {
	const fromHtml = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(node.html ?? "")?.[1];
	if (fromHtml !== void 0) return fromHtml.toLowerCase();
	return (/^([a-zA-Z][a-zA-Z0-9-]*)/.exec(selector ?? "")?.[1] ?? "element").toLowerCase();
}
/** The node's visible text, collapsed and truncated for display.
* @param node - the axe node.
* @returns the excerpt, or undefined when the markup carries no text.
*/
function textOf(node) {
	const stripped = (node.html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
	if (stripped.length === 0) return void 0;
	return stripped.length > TEXT_LIMIT$1 ? stripped.slice(0, TEXT_LIMIT$1) + "…" : stripped;
}
/** The element evidence for one axe node that reported a selector.
* @param node - the axe node.
* @returns the reference and rectangle, or undefined when no selector was reported.
*/
function evidenceOf(node, measured) {
	const selector = selectorOf(node);
	if (selector === void 0) return void 0;
	const text = textOf(node);
	return {
		element: {
			tag: tagOf(node, selector),
			selector,
			...text === void 0 ? {} : { text }
		},
		box: measured ?? {
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
			...violation.description === void 0 ? {} : { description: violation.description },
			...violation.helpUrl === void 0 ? {} : { helpUrl: violation.helpUrl },
			nodes: violation.nodes.map((node) => ({
				...node.target === void 0 ? {} : { target: node.target },
				...node.html === void 0 ? {} : { html: node.html }
			}))
		}));
	}) });
	if (report === void 0) throw new Error("axe-core returned no structured violations");
	const selectors = report.violations.flatMap((violation) => violation.nodes.map((node) => selectorOf(node))).filter((selector) => selector !== void 0);
	const measured = await page.evaluate((wanted) => wanted.map((selector) => {
		try {
			const element = document.querySelector(selector);
			if (element === null) return null;
			const rect = element.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) return null;
			return {
				x: Math.round(rect.x),
				y: Math.round(rect.y),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				space: "viewport"
			};
		} catch {
			return null;
		}
	}), selectors);
	const boxBySelector = /* @__PURE__ */ new Map();
	selectors.forEach((selector, index) => {
		const box = measured[index];
		if (box !== null && box !== void 0) boxBySelector.set(selector, box);
	});
	return report.violations.map((violation) => {
		const evidence = violation.nodes.slice(0, 10).map((node) => {
			const selector = selectorOf(node);
			return evidenceOf(node, selector === void 0 ? void 0 : boxBySelector.get(selector));
		}).filter((entry) => entry !== void 0);
		return {
			rule: "axe:" + violation.id,
			detail: violation.help + " (" + String(violation.nodes.length) + " node(s))",
			...violation.description === void 0 ? {} : { requirement: violation.description },
			...violation.helpUrl === void 0 ? {} : { helpUrl: violation.helpUrl },
			severity: violation.impact !== null && BLOCKING.has(violation.impact) ? "high" : "medium",
			evidence
		};
	});
}
//#endregion
//#region lib/types/experience/in-page.js
/**
* Whether an element's computed style draws a visible focus indicator.
* @param style - the element's computed style.
* @returns true when an outline or a shadow would be visible.
*/
function drawsFocusIndicator(style) {
	const isTransparent = (value) => {
		const text = value.trim().toLowerCase();
		if (text === "" || text === "none" || text === "transparent") return true;
		const match = /rgba?\(([^)]*)\)/.exec(text);
		if (match !== null) {
			const parts = match[1].split(/[\s,/]+/).filter((part) => part !== "");
			if (parts.length < 4) return false;
			const alpha = Number.parseFloat(parts[3]);
			return Number.isFinite(alpha) && alpha === 0;
		}
		return text.split(/\s+/).includes("transparent");
	};
	const width = Number.parseFloat(style.outlineWidth === "" ? "0" : style.outlineWidth);
	const shorthand = style.outline === "" ? "" : String(style.outline).trim().toLowerCase();
	const shorthandSuppressed = /(^|\s)none(\s|$)/.test(shorthand);
	const shorthandWidthText = /(^|\s)([0-9]*\.?[0-9]+)(?:px|em|rem|pt)(\s|$)|(^|\s)(thin|medium|thick)(\s|$)/.exec(shorthand);
	const shorthandPixels = shorthandWidthText?.[2] === void 0 ? void 0 : Number.parseFloat(shorthandWidthText[2]);
	const shorthandHasWidth = shorthandWidthText !== null && (shorthandPixels === void 0 || shorthandPixels > 0);
	const shorthandColorTransparent = shorthand.split(/\s+/).some((part) => part === "transparent" || /^rgba?\(/.test(part) && isTransparent(part));
	const shorthandDrawn = shorthand !== "" && !shorthandSuppressed && shorthandHasWidth && !shorthandColorTransparent;
	const longhandDrawn = style.outlineStyle !== "none" && width > 0 && !isTransparent(style.outlineColor);
	const shadow = style.boxShadow === "" ? "none" : String(style.boxShadow);
	return shorthandDrawn || longhandDrawn || shadow !== "none" && !isTransparent(shadow);
}
/**
* The source text of {@link drawsFocusIndicator}, for embedding in a serialized
* inspection that runs in the page.
* @returns the function source as an expression.
*/
function drawsFocusIndicatorSource() {
	return "(" + drawsFocusIndicator.toString() + ")";
}
/**
* Make a serializer-rewritten helper available to page-context functions.
*
* The stand-in returns the function unchanged, which preserves the only
* behaviour the serialized code relies on: naming a function has no effect on
* how it runs. An existing definition is left alone, so a page that already
* provides one keeps it.
* @param page - the page that will run the serialized function.
* @returns a promise settling once the helper is defined.
*/
async function ensurePageHelpers(page) {
	await page.evaluate(() => {
		const scope = globalThis;
		if (typeof scope.__name !== "function") scope.__name = (value) => value;
	});
}
/** Longest visible-text excerpt kept on a reference. */
const TEXT_LIMIT = 80;
/** Whether a candidate is visible enough for a user to reach it. */
const REACHABLE = "a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex=\"-1\"]),[contenteditable=\"true\"]";
/**
* Inspect the page for keyboard barriers.
*
* Runs in three passes:
* 1. Each focusable element is focused in turn and its computed style examined,
*    because a focus indicator only exists while its element has focus.
* 2. Any visible dialog is probed with Tab to see whether focus stays inside.
* 3. That dialog is sent Escape to see whether it dismisses.
* @param page - the page to inspect.
* @returns the violations found, in rule order.
*/
async function checkKeyboard(page) {
	const evaluator = page;
	const inspect = (config) => {
		const drawsFocus = new Function("return " + config.drawsFocusSource)();
		const found = [];
		const elementInfo = (element) => {
			const rect = element.getBoundingClientRect();
			const box = {
				x: Math.round(rect.left),
				y: Math.round(rect.top),
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				space: "viewport"
			};
			const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
			return {
				element: {
					tag: (element.tagName || "element").toLowerCase(),
					selector: element.id !== "" ? "#" + element.id : (element.tagName || "element").toLowerCase(),
					...text === "" ? {} : { text: text.length > config.textLimit ? text.slice(0, config.textLimit) + "…" : text }
				},
				box
			};
		};
		const isRendered = (element) => {
			let node = element;
			while (node !== null) {
				const style = window.getComputedStyle(node);
				if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
				node = node.parentElement;
			}
			return true;
		};
		const candidates = Array.from(document.querySelectorAll(config.reachable)).filter(isRendered).slice(0, config.maxSamples);
		const withoutIndicator = [];
		for (const candidate of candidates) {
			const focusable = candidate;
			focusable.focus();
			if (document.activeElement !== focusable) continue;
			if (!drawsFocus(window.getComputedStyle(focusable))) withoutIndicator.push(candidate);
		}
		if (withoutIndicator.length > 0) found.push({
			rule: "keyboard-focus-not-visible",
			detail: String(withoutIndicator.length) + " of " + String(candidates.length) + " reachable element(s) draw no visible focus indicator",
			severity: "medium",
			evidence: withoutIndicator.slice(0, 10).map(elementInfo)
		});
		const dialog = document.querySelector("[role=\"dialog\"],[role=\"alertdialog\"],dialog[open]");
		if (dialog === null) return found;
		const heading = dialog.getAttribute("aria-label") ?? dialog.getAttribute("aria-labelledby") ?? "unnamed dialog";
		found.push({
			rule: "keyboard-dialog-present",
			detail: "a dialog is open at the end of the journey: " + heading,
			severity: "medium",
			evidence: [elementInfo(dialog)]
		});
		return found;
	};
	await ensurePageHelpers(page);
	return await evaluator.evaluate(inspect, {
		reachable: REACHABLE,
		maxSamples: 60,
		textLimit: TEXT_LIMIT,
		drawsFocusSource: drawsFocusIndicatorSource()
	});
}
/**
* Probe an open dialog with the keyboard: whether focus stays inside it, and
* whether Escape dismisses it.
*
* These need real key events, so they cannot run inside a single page evaluation.
* @param page - the page to drive.
* @returns the violations found, in rule order.
*/
async function probeOpenDialog(page) {
	const found = [];
	const locator = page.locator("[role=\"dialog\"],[role=\"alertdialog\"],dialog[open]");
	if (await locator.count() === 0) return found;
	const dialog = locator.first();
	if (!await dialog.isVisible().catch(() => false)) return found;
	for (let index = 0; index < 12; index++) await page.keyboard.press("Tab");
	if (await dialog.evaluate((node) => {
		const active = document.activeElement;
		return active === null || !node.contains(active);
	})) found.push({
		rule: "keyboard-focus-trap-missing",
		detail: "focus left the open dialog after " + String(12) + " Tab presses, so a keyboard user can reach the page behind it",
		severity: "high",
		evidence: []
	});
	await page.keyboard.press("Escape");
	if (!await dialog.isVisible().then((visible) => !visible).catch(() => false)) found.push({
		rule: "keyboard-escape-ignored",
		detail: "Escape did not dismiss the open dialog",
		severity: "high",
		evidence: []
	});
	return found;
}
//#endregion
//#region lib/types/experience/behavior/environment.js
/**
* The emulated profiles, expressed the way the browser's own emulation wants
* them: bytes per second, not the kilobits per second the names suggest.
*/
const NETWORK_PROFILES = {
	offline: {
		downloadBytesPerSecond: 0,
		uploadBytesPerSecond: 0,
		latencyMs: 0
	},
	slow3g: {
		downloadBytesPerSecond: 51200,
		uploadBytesPerSecond: 51200,
		latencyMs: 400
	},
	fast3g: {
		downloadBytesPerSecond: 204800,
		uploadBytesPerSecond: 96e3,
		latencyMs: 150
	},
	slow4g: {
		downloadBytesPerSecond: 512e3,
		uploadBytesPerSecond: 384e3,
		latencyMs: 100
	}
};
/**
* Apply a persona's environment to one page.
*
* CPU throttling is applied after the network profile so a page that is both slow
* and CPU-bound is measured under both, and both are lifted together.
* @param page - the page to condition.
* @param environment - the policy to apply.
* @returns what was applied and how to remove it.
*/
async function applyEnvironment(page, environment) {
	const profileName = environment.network;
	const cpuThrottle = environment.cpuThrottle;
	if (profileName === void 0 && cpuThrottle === void 0) return {
		applied: [],
		restore: async () => void 0
	};
	const cdp = await page.context().newCDPSession(page);
	const applied = [];
	if (profileName !== void 0) {
		const profile = NETWORK_PROFILES[profileName];
		await cdp.send("Network.enable");
		await cdp.send("Network.emulateNetworkConditions", {
			offline: profileName === "offline",
			downloadThroughput: profile.downloadBytesPerSecond,
			uploadThroughput: profile.uploadBytesPerSecond,
			latency: profile.latencyMs
		});
		applied.push(profileName);
	}
	if (cpuThrottle !== void 0) {
		await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
		applied.push("cpu×" + String(cpuThrottle));
	}
	return {
		applied,
		async restore() {
			if (cpuThrottle !== void 0) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
			if (profileName !== void 0) await cdp.send("Network.emulateNetworkConditions", {
				offline: false,
				downloadThroughput: -1,
				uploadThroughput: -1,
				latency: 0
			});
		}
	};
}
/** The built-in policies, keyed by preset id. */
const BEHAVIOR_PRESETS = {
	neutral: {
		id: "neutral",
		summary: "Declared steps replayed with default timing and a pointer.",
		input: {
			boundaryInputs: [],
			doubleSubmit: false
		},
		timing: {
			settleBudgetMs: 2e4,
			waitForIdle: true
		},
		modality: {
			pointer: true,
			tabBudget: 40
		},
		environment: {},
		recovery: {
			retries: 0,
			alternativePaths: []
		}
	},
	"first-time": {
		id: "first-time",
		summary: "Waits for the page to settle fully and reads before acting.",
		input: {
			boundaryInputs: [],
			doubleSubmit: false,
			typeDelayMs: 60
		},
		timing: {
			settleBudgetMs: 2e4,
			waitForIdle: true,
			hesitateMs: 400
		},
		modality: {
			pointer: true,
			tabBudget: 40
		},
		environment: {},
		recovery: {
			retries: 0,
			alternativePaths: []
		}
	},
	expert: {
		id: "expert",
		summary: "Acts immediately, never waits for idle, and dismisses overlays.",
		input: {
			boundaryInputs: [],
			doubleSubmit: false
		},
		timing: {
			settleBudgetMs: 1500,
			waitForIdle: false
		},
		modality: {
			pointer: true,
			tabBudget: 25
		},
		environment: {},
		recovery: {
			retries: 0,
			alternativePaths: ["pressEscape"]
		}
	},
	keyboard: {
		id: "keyboard",
		summary: "Reaches every target with Tab and activates with the keyboard.",
		input: {
			boundaryInputs: [],
			doubleSubmit: false
		},
		timing: {
			settleBudgetMs: 2e4,
			waitForIdle: true
		},
		modality: {
			pointer: false,
			tabBudget: 60
		},
		environment: {},
		recovery: {
			retries: 0,
			alternativePaths: ["pressEscape"]
		}
	},
	"error-prone": {
		id: "error-prone",
		summary: "Submits boundary input and interrupts the flow to see whether state survives.",
		input: {
			boundaryInputs: [
				{ kind: "empty" },
				{ kind: "veryLong" },
				{ kind: "emoji" },
				{ kind: "rtl" },
				{ kind: "html" }
			],
			doubleSubmit: false
		},
		timing: {
			settleBudgetMs: 2e4,
			waitForIdle: true
		},
		modality: {
			pointer: true,
			tabBudget: 40
		},
		environment: {},
		recovery: {
			retries: 1,
			alternativePaths: ["reload"]
		}
	},
	mobile: {
		id: "mobile",
		summary: "Runs on a constrained connection and must cope with being interrupted.",
		input: {
			boundaryInputs: [],
			doubleSubmit: false
		},
		timing: {
			settleBudgetMs: 45e3,
			waitForIdle: true,
			paceMs: 150
		},
		modality: {
			pointer: true,
			tabBudget: 50
		},
		environment: {
			network: "slow4g",
			cpuThrottle: 4
		},
		recovery: {
			retries: 1,
			alternativePaths: ["reload"]
		}
	},
	impatient: {
		id: "impatient",
		summary: "Never waits for the page and fires submit-like actions twice.",
		input: {
			boundaryInputs: [],
			doubleSubmit: true
		},
		timing: {
			settleBudgetMs: 750,
			waitForIdle: false
		},
		modality: {
			pointer: true,
			tabBudget: 30
		},
		environment: {},
		recovery: {
			retries: 0,
			alternativePaths: []
		}
	}
};
Object.keys(BEHAVIOR_PRESETS);
/**
* Resolve one preset by id.
* @param id - the preset id.
* @returns the preset, or undefined when no preset has that id.
*/
function presetById(id) {
	return BEHAVIOR_PRESETS[id];
}
"x".repeat(4096);
//#endregion
//#region lib/types/experience/behavior/index.js
/**
* Resolving a declared persona behaviour into the concrete policy a run uses.
*
* A configuration names either a preset or a preset plus overrides. Resolution
* is explicit and fails loudly on an unknown preset, because a typo that
* silently fell back to `neutral` would make a persona claim behaviour it does
* not have.
* @module @cbhdyl/dsh-test-observatory/experience/behavior
*/
/** The policy used when a journey declares no behaviour at all. */
const DEFAULT_BEHAVIOR = BEHAVIOR_PRESETS["neutral"];
/**
* Resolve a declared behaviour into a complete policy.
* @param declared - a preset id, or a preset plus overrides, or undefined.
* @returns the complete policy.
* @throws when the declaration names a preset that does not exist.
*/
function resolveBehavior(declared) {
	if (declared === void 0) return DEFAULT_BEHAVIOR;
	if (typeof declared === "string") {
		const preset = presetById(declared);
		if (preset === void 0) throw new Error("unknown persona behaviour \"" + declared + "\"; known presets: " + Object.keys(BEHAVIOR_PRESETS).join(", "));
		return preset;
	}
	const preset = presetById(declared.preset);
	if (preset === void 0) throw new Error("unknown persona behaviour \"" + declared.preset + "\"; known presets: " + Object.keys(BEHAVIOR_PRESETS).join(", "));
	return {
		id: preset.id,
		summary: declared.input === void 0 && declared.timing === void 0 && declared.modality === void 0 && declared.environment === void 0 && declared.recovery === void 0 ? preset.summary : preset.summary + " (overridden)",
		input: {
			...preset.input,
			...declared.input
		},
		timing: {
			...preset.timing,
			...declared.timing
		},
		modality: {
			...preset.modality,
			...declared.modality
		},
		environment: {
			...preset.environment,
			...declared.environment
		},
		recovery: {
			...preset.recovery,
			...declared.recovery
		}
	};
}
/**
* The dimensions a policy changes relative to {@link DEFAULT_BEHAVIOR}, for the
* report's persona card.
* @param behavior - the resolved policy.
* @returns short labels naming each changed dimension.
*/
function behaviorDimensions(behavior) {
	const labels = [];
	if (!behavior.modality.pointer) labels.push("keyboard-only");
	if (behavior.input.boundaryInputs.length > 0) labels.push("boundary-input");
	if (behavior.input.doubleSubmit) labels.push("double-submit");
	if (!behavior.timing.waitForIdle) labels.push("no-settle");
	if (behavior.timing.hesitateMs !== void 0) labels.push("hesitant");
	if (behavior.timing.paceMs !== void 0) labels.push("paced");
	if (behavior.environment.network !== void 0) labels.push(behavior.environment.network);
	if (behavior.environment.cpuThrottle !== void 0) labels.push("cpu×" + String(behavior.environment.cpuThrottle));
	if (behavior.recovery.retries > 0) labels.push("retries");
	if (behavior.recovery.alternativePaths.length > 0) labels.push("recovery-paths");
	return labels;
}
//#endregion
//#region lib/types/experience/focus.js
/**
* Choose what a screenshot should show.
*
* A whole-viewport capture of a sparse page is mostly empty space, and the
* reader cannot tell which part the step was about. Hand-written selectors do
* not travel: a plugin installed on another machine has no idea what that
* project's markup looks like. This module decides from the rendered document
* alone, so the same plugin works on any project without configuration.
*
* The rule is the densest region that still carries most of the page's text:
* the smallest element holding a large share of the content is the one a
* reader wants, and its density separates it from a full-height wrapper that
* also contains everything.
* @module @cbhdyl/dsh-test-observatory/experience/focus
*/
/**
* Pick the densest region that carries most of the page's visible text.
*
* Runs inside the page, so it uses only globals the browser provides and never
* reaches back into this module.
* @returns the chosen region, or undefined when the page has no such region.
*/
function detectContentRegion() {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const viewportArea = Math.max(1, viewportWidth * viewportHeight);
	const visible = (element) => {
		const style = window.getComputedStyle(element);
		if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	};
	const textLength = (element) => (element.textContent ?? "").replace(/\s+/gu, " ").trim().length;
	const bodyChars = textLength(document.body);
	if (bodyChars === 0) return void 0;
	const candidates = [];
	for (const selector of [
		"main",
		"[role=\"main\"]",
		"article",
		"section",
		"#app",
		"#root"
	]) for (const element of Array.from(document.querySelectorAll(selector))) candidates.push(element);
	for (const child of Array.from(document.body.children)) {
		candidates.push(child);
		for (const grandchild of Array.from(child.children)) candidates.push(grandchild);
	}
	let best;
	let bestScore = 0;
	let bestTag = "";
	for (const element of candidates) {
		if (!visible(element)) continue;
		const chars = textLength(element);
		if (chars < bodyChars * .3) continue;
		const rect = element.getBoundingClientRect();
		if (rect.width < 120 || rect.height < 120) continue;
		if (rect.width * rect.height > viewportArea * .85) continue;
		const score = chars / Math.max(1, rect.width * rect.height);
		if (score > bestScore) {
			bestScore = score;
			bestTag = element.tagName.toLowerCase();
			const x = Math.max(0, Math.round(rect.left));
			const y = Math.max(0, Math.round(rect.top));
			let inkArea = 0;
			const seenRects = [];
			for (const child of Array.from(element.querySelectorAll("*"))) {
				if (!visible(child)) continue;
				if ((child.textContent ?? "").trim().length === 0) continue;
				const childRect = child.getBoundingClientRect();
				const box = {
					left: Math.max(rect.left, childRect.left),
					top: Math.max(rect.top, childRect.top),
					right: Math.min(rect.right, childRect.right),
					bottom: Math.min(rect.bottom, childRect.bottom)
				};
				if (box.right <= box.left || box.bottom <= box.top) continue;
				let covered = false;
				for (const other of seenRects) if (other.left <= box.left && other.top <= box.top && other.right >= box.right && other.bottom >= box.bottom) {
					covered = true;
					break;
				}
				if (covered) continue;
				seenRects.push(box);
				inkArea += (box.right - box.left) * (box.bottom - box.top);
			}
			const inkShare = Math.min(1, inkArea / Math.max(1, rect.width * rect.height));
			best = {
				reason: bestTag + " carries " + String(Math.round(100 * chars / bodyChars)) + "% of the page text in " + String(Math.round(rect.width)) + "x" + String(Math.round(rect.height)),
				inkShare,
				x,
				y,
				width: Math.min(Math.round(rect.width), viewportWidth - x),
				height: Math.min(Math.round(rect.height), viewportHeight - y),
				textChars: chars
			};
		}
	}
	return best !== void 0 && best.width >= 120 && best.height >= 120 ? best : void 0;
}
/**
* Ask the page which region a capture should show.
* @param page - the page to inspect.
* @returns the chosen region, or undefined when the page has no distinct one.
*/
async function focusRegion(page) {
	await ensurePageHelpers(page);
	return await page.evaluate(detectContentRegion);
}
//#endregion
//#region lib/types/experience/annotate.js
/** Attribute marking every node this module injects, so removal is exact. */
const OVERLAY_ATTRIBUTE = "data-observatory-overlay";
/** Colour used for a blocking finding. */
const HIGH_COLOR = "#e5484d";
/** Colour used for a non-blocking finding. */
const MEDIUM_COLOR = "#d97706";
/**
* Draw the given regions and return a handle that removes them.
*
* The overlay is `position:fixed`, ignores pointer events and sits at the top
* of the stacking order, so it cannot change layout, intercept a click or be
* covered by page content. The caller must inject it *after* every page check
* has run, so checks never observe the marks they produced.
* @param page - the page to mark.
* @param annotations - the regions to draw.
* @returns the handle plus what was drawn and skipped.
*/
async function annotate(page, annotations) {
	const drawable = annotations.filter((annotation) => annotation.evidence.box.space === "viewport");
	const skipped = annotations.filter((annotation) => annotation.evidence.box.space !== "viewport").map((annotation) => annotation.label);
	const payload = drawable.map((annotation) => ({
		label: annotation.label,
		color: annotation.severity === "high" ? HIGH_COLOR : MEDIUM_COLOR,
		x: annotation.evidence.box.x,
		y: annotation.evidence.box.y,
		width: annotation.evidence.box.width,
		height: annotation.evidence.box.height
	}));
	return {
		drawn: await page.evaluate((payload) => {
			const { items, attribute } = payload;
			const host = document.createElement("div");
			host.setAttribute(attribute, "host");
			host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
			const results = [];
			for (const item of items) {
				const box = document.createElement("div");
				box.setAttribute(attribute, "box");
				box.style.cssText = [
					"position:fixed",
					"box-sizing:border-box",
					"pointer-events:none",
					"border:2px solid " + item.color,
					"border-radius:4px",
					"left:" + String(item.x) + "px",
					"top:" + String(item.y) + "px",
					"width:" + String(item.width) + "px",
					"height:" + String(item.height) + "px"
				].join(";");
				const label = document.createElement("span");
				label.setAttribute(attribute, "label");
				label.textContent = item.label;
				label.style.cssText = [
					"position:fixed",
					"pointer-events:none",
					"max-width:60vw",
					"overflow:hidden",
					"text-overflow:ellipsis",
					"white-space:nowrap",
					"background:" + item.color,
					"color:#fff",
					"font:600 11px/16px system-ui,sans-serif",
					"padding:1px 5px",
					"border-radius:3px"
				].join(";");
				label.style.top = String(Math.max(0, item.y - 18)) + "px";
				label.style.left = String(Math.max(0, item.x)) + "px";
				host.append(box, label);
				const measured = {
					label: item.label,
					x: item.x,
					y: item.y,
					width: item.width,
					height: item.height
				};
				results.push(measured);
			}
			if (results.length > 0) document.body.append(host);
			return results;
		}, {
			items: payload,
			attribute: OVERLAY_ATTRIBUTE
		}),
		skipped,
		async remove() {
			await page.evaluate((attribute) => {
				for (const node of Array.from(document.querySelectorAll("[" + attribute + "]"))) node.remove();
			}, OVERLAY_ATTRIBUTE);
		}
	};
}
/**
* Whether any overlay node is still attached to the page.
* @param page - the page to inspect.
* @returns true when at least one overlay node remains.
*/
async function overlayPresent(page) {
	return await page.evaluate((attribute) => document.querySelector("[" + attribute + "]") !== null, OVERLAY_ATTRIBUTE);
}
//#endregion
//#region lib/types/experience/integrity.js
/**
* Evidence integrity: the checks that make "this screenshot is trustworthy" a
* statement the report can support rather than an assumption.
*
* Two questions are answered separately and never conflated:
* 1. Is the image a faithful capture of what the browser rendered then?
* 2. Is the interface itself correct?
* This module answers only the first. The second needs a reviewed baseline and
* a human, and is therefore out of scope here.
* @module @cbhdyl/dsh-test-observatory/experience/integrity
*/
/**
* Find captures whose image repeats an earlier capture's image.
* @param shots - every capture the run made, in capture order.
* @returns the repeats, each naming the capture it duplicates.
*/
function findDuplicateEvidence(shots) {
	const seen = /* @__PURE__ */ new Map();
	const duplicates = [];
	for (const shot of shots) {
		const digest = createHash("sha256").update(shot.imageDataUri).digest("hex");
		const first = seen.get(digest);
		if (first === void 0) seen.set(digest, shot.id);
		else duplicates.push({
			id: shot.id,
			firstId: first
		});
	}
	return duplicates;
}
/** Smallest capture that is still considered usable evidence. */
const MIN_CAPTURE_BYTES = 1024;
/**
* Decide whether one capture is trustworthy evidence.
*
* A capture with any defect must be shown to the reader as untrusted rather than
* presented silently, because an unverifiable screenshot is indistinguishable
* from a correct one at a glance.
* @param facts - what was measured about the capture.
* @returns every defect found; an empty list means the capture can be trusted.
*/
function auditCapture(facts) {
	const defects = [];
	if (facts.cleanBytes < 1024) defects.push({
		rule: "evidence-too-small",
		detail: "the capture is " + String(facts.cleanBytes) + " bytes, below the " + String(MIN_CAPTURE_BYTES) + "-byte floor, so it is probably blank"
	});
	if (facts.overlayLeftBehind) defects.push({
		rule: "evidence-overlay-left-behind",
		detail: "an annotation overlay was still attached after capture, so the page is no longer in the state the checks measured"
	});
	if (facts.drawn.length > 0 && facts.annotatedBytes === void 0) defects.push({
		rule: "evidence-annotation-missing",
		detail: String(facts.drawn.length) + " annotation(s) were drawn but no annotated capture was produced"
	});
	if (facts.drawn.length > 0 && facts.annotatedBytes !== void 0 && facts.annotatedBytes === facts.cleanBytes) defects.push({
		rule: "evidence-annotation-not-visible",
		detail: "the annotated capture is byte-identical to the clean one, so the annotations are not in the image"
	});
	const width = facts.imageWidth;
	const height = facts.imageHeight;
	if (width !== void 0 && width !== facts.expectedWidth) defects.push({
		rule: "evidence-size-mismatch",
		detail: "the capture is " + String(width) + "px wide but the page reported " + String(facts.expectedWidth) + "px"
	});
	if (height !== void 0 && height !== facts.expectedHeight) defects.push({
		rule: "evidence-size-mismatch",
		detail: "the capture is " + String(height) + "px tall but the page reported " + String(facts.expectedHeight) + "px"
	});
	return defects;
}
//#endregion
//#region lib/types/experience/mask.js
/**
* Hide the elements matching the given selectors.
*
* Visibility is saved and restored per element rather than via an injected
* stylesheet, so an element's own inline style survives untouched.
* @param page - the page to mask.
* @param selectors - CSS selectors for dynamic regions.
* @returns the handle that restores them.
*/
async function maskDynamic(page, selectors) {
	if (selectors.length === 0) return {
		matched: [],
		unmatched: [],
		restore: async () => void 0
	};
	const result = await page.evaluate((wanted) => {
		const matched = [];
		const unmatched = [];
		for (const selector of wanted) {
			const found = Array.from(document.querySelectorAll(selector));
			if (found.length === 0) {
				unmatched.push(selector);
				continue;
			}
			matched.push(selector);
			for (const element of found) {
				const target = element;
				target.setAttribute("data-observatory-mask-was", target.style.visibility);
				target.style.visibility = "hidden";
			}
		}
		return {
			matched,
			unmatched
		};
	}, selectors);
	return {
		matched: result.matched,
		unmatched: result.unmatched,
		async restore() {
			await page.evaluate(() => {
				for (const element of Array.from(document.querySelectorAll("[data-observatory-mask-was]"))) {
					const target = element;
					target.style.visibility = target.getAttribute("data-observatory-mask-was") ?? "";
					target.removeAttribute("data-observatory-mask-was");
				}
			});
		}
	};
}
//#endregion
//#region lib/types/experience/capture.js
/** Bound on one captured image's encoded size, so the report stays openable. */
const MAX_SHOT_BYTES = 4e5;
/** Quality ladder tried in order until an image fits {@link MAX_SHOT_BYTES}. */
const ENCODINGS = [
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
];
/**
* Encode the page within the size bound, degrading quality rather than dropping
* the evidence a human needs to judge the finding.
* @param page - the page to encode.
* @returns the encoded image and its byte length.
*/
async function encode(page) {
	let smallest = 0;
	for (const attempt of ENCODINGS) {
		const options = { type: attempt.type };
		if (attempt.quality !== void 0) options.quality = attempt.quality;
		const buffer = await page.screenshot(options);
		smallest = buffer.byteLength;
		if (buffer.byteLength <= 4e5) return {
			dataUri: "data:" + (attempt.type === "png" ? "image/png" : "image/jpeg") + ";base64," + buffer.toString("base64"),
			bytes: buffer.byteLength
		};
	}
	return { bytes: smallest };
}
/**
* Measure the page's visible size.
* @param page - the page to measure.
* @returns the viewport the capture should reproduce.
*/
async function measureViewport(page) {
	return await page.evaluate(() => ({
		width: window.innerWidth,
		height: window.innerHeight
	}));
}
/**
* Capture the page's current state as evidence.
*
* Order matters: annotations are injected only after the clean image exists and
* are removed before this function returns, so a page check can never observe
* the marks, and the marked image is the only one that contains them.
* @param page - the page to capture.
* @param annotations - regions to mark on the second image.
* @param masks - selectors of dynamic regions to hide for every image.
* @returns the images and the integrity verdict for this capture.
*/
async function captureEvidence(page, annotations = [], masks = []) {
	const mask = await maskDynamic(page, masks);
	try {
		return await captureMasked(page, annotations);
	} finally {
		await mask.restore();
	}
}
/**
* Capture the page while the caller holds any masking in place.
* @param page - the page to capture.
* @param annotations - regions to mark on the second image.
* @returns the images and the integrity verdict.
*/
/**
* Capture one element instead of the viewport. A sparse page renders mostly
* empty space, so an unfocused capture shows a reader almost nothing; the
* element the step is about is the evidence the step was meant to produce.
* @param page - the page to capture from.
* @param selector - the element to capture.
* @returns the encoded image and its integrity defects.
* @throws when the element never becomes visible or has no layout box.
*/
async function captureElement(page, selector) {
	const target = page.locator(selector).first();
	await target.waitFor({
		state: "visible",
		timeout: 5e3
	});
	const box = await target.boundingBox();
	if (box === null) throw new Error("screenshot target " + JSON.stringify(selector) + " has no layout box");
	let bytes = await target.screenshot({ type: "png" });
	let mime = "image/png";
	for (const quality of [
		80,
		60,
		40
	]) {
		if (bytes.byteLength <= 4e5) break;
		bytes = await target.screenshot({
			type: "jpeg",
			quality
		});
		mime = "image/jpeg";
	}
	const defects = auditCapture({
		cleanBytes: bytes.byteLength,
		drawn: [],
		overlayLeftBehind: false,
		expectedWidth: Math.round(box.width),
		expectedHeight: Math.round(box.height)
	});
	if (bytes.byteLength > 4e5) return { defects: [...defects, {
		rule: "evidence-too-large",
		detail: "the element capture is " + String(bytes.byteLength) + " bytes, above the " + String(MAX_SHOT_BYTES) + "-byte bound"
	}] };
	return {
		clean: "data:" + mime + ";base64," + bytes.toString("base64"),
		defects
	};
}
/**
* One box covering every element a finding measured.
* @param boxes - the measured rectangles of the finding's elements.
* @param viewport - visible page size, so the crop stays inside the page.
* @returns the padded box, or undefined when no element was measured.
*/
function unionBox(boxes, viewport) {
	const measured = boxes.filter((box) => box.width > 0 && box.height > 0 && box.space === "viewport");
	if (measured.length === 0) return void 0;
	const left = Math.max(0, Math.min(...measured.map((box) => box.x)) - 24);
	const top = Math.max(0, Math.min(...measured.map((box) => box.y)) - 24);
	const right = Math.min(viewport.width, Math.max(...measured.map((box) => box.x + box.width)) + 24);
	const bottom = Math.min(viewport.height, Math.max(...measured.map((box) => box.y + box.height)) + 24);
	if (right - left < 40 || bottom - top < 40) return void 0;
	return {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top
	};
}
/**
* Capture one picture per finding, showing the elements that finding measured.
*
* A whole-page screenshot of a finding says only that something is wrong
* somewhere on the page. The crop is the finding's own evidence: the boxes the
* check measured, with enough around them to place them.
* @param page - the page the findings were measured on.
* @param findings - the findings to illustrate, in report order.
* @returns one data URI per finding, in the same order, undefined where none could be taken.
*/
async function captureFindingCrops(page, findings) {
	let viewport = {
		width: 1280,
		height: 720
	};
	try {
		viewport = page.viewportSize() ?? viewport;
	} catch {}
	const crops = [];
	for (let index = 0; index < findings.length; index += 1) {
		const finding = findings[index];
		if (index >= 12 || finding?.evidence === void 0) {
			crops.push(void 0);
			continue;
		}
		const box = unionBox(finding.evidence.map((entry) => entry.box), viewport);
		if (box === void 0) {
			crops.push(void 0);
			continue;
		}
		try {
			let bytes = await page.screenshot({
				type: "png",
				clip: box
			});
			let mime = "image/png";
			if (bytes.byteLength > 12e4) {
				bytes = await page.screenshot({
					type: "jpeg",
					quality: 60,
					clip: box
				});
				mime = "image/jpeg";
			}
			crops.push(bytes.byteLength > 12e4 ? void 0 : "data:" + mime + ";base64," + bytes.toString("base64"));
		} catch {
			crops.push(void 0);
		}
	}
	return crops;
}
/**
* Capture the densest region of the page instead of the whole viewport, so a
* sparse screen still yields evidence a reader can use. Falls back to nothing
* when the page has no distinct region, and the caller captures the viewport.
* @param page - the page to capture from.
* @returns the encoded region and its integrity defects.
*/
async function captureFocused(page) {
	const region = await focusRegion(page);
	if (region === void 0) return { defects: [] };
	let bytes = await page.screenshot({
		type: "png",
		clip: {
			x: region.x,
			y: region.y,
			width: region.width,
			height: region.height
		}
	});
	let mime = "image/png";
	if (bytes.byteLength > 4e5) {
		bytes = await page.screenshot({
			type: "jpeg",
			quality: 60,
			clip: {
				x: region.x,
				y: region.y,
				width: region.width,
				height: region.height
			}
		});
		mime = "image/jpeg";
	}
	const defects = auditCapture({
		cleanBytes: bytes.byteLength,
		drawn: [],
		overlayLeftBehind: false,
		expectedWidth: region.width,
		expectedHeight: region.height
	});
	const lowContent = region.inkShare < .25 ? [{
		rule: "evidence-low-content",
		detail: "only " + String(Math.round(region.inkShare * 100)) + "% of the captured region carries content, so the page is mostly empty space"
	}] : [];
	if (bytes.byteLength > 4e5) return {
		defects: [
			...defects,
			...lowContent,
			{
				rule: "evidence-too-large",
				detail: "the focused capture is " + String(bytes.byteLength) + " bytes at every quality, above the " + String(MAX_SHOT_BYTES) + "-byte bound"
			}
		],
		focus: region.reason
	};
	return {
		clean: "data:" + mime + ";base64," + bytes.toString("base64"),
		defects: [...defects, ...lowContent],
		focus: region.reason
	};
}
async function captureMasked(page, annotations) {
	const viewport = await measureViewport(page);
	const clean = await encode(page);
	if (clean.dataUri === void 0) return { defects: [{
		rule: "evidence-too-small",
		detail: "no encoding of the page fitted the " + String(MAX_SHOT_BYTES) + "-byte bound; the smallest was " + String(clean.bytes) + " bytes"
	}] };
	if (annotations.length === 0) return {
		clean: clean.dataUri,
		defects: auditCapture({
			cleanBytes: clean.bytes,
			drawn: [],
			overlayLeftBehind: false,
			expectedWidth: viewport.width,
			expectedHeight: viewport.height
		})
	};
	const overlay = await annotate(page, annotations);
	if (overlay.drawn.length === 0) {
		await overlay.remove();
		return {
			clean: clean.dataUri,
			defects: auditCapture({
				cleanBytes: clean.bytes,
				drawn: [],
				overlayLeftBehind: await overlayPresent(page),
				expectedWidth: viewport.width,
				expectedHeight: viewport.height
			})
		};
	}
	let annotated;
	let leftBehind = false;
	try {
		annotated = await encode(page);
	} finally {
		await overlay.remove();
		leftBehind = await overlayPresent(page);
	}
	const defects = auditCapture({
		cleanBytes: clean.bytes,
		...annotated?.dataUri === void 0 ? {} : { annotatedBytes: annotated.bytes },
		drawn: overlay.drawn,
		overlayLeftBehind: leftBehind,
		expectedWidth: viewport.width,
		expectedHeight: viewport.height
	});
	return {
		clean: clean.dataUri,
		...annotated?.dataUri === void 0 ? {} : { annotated: annotated.dataUri },
		defects
	};
}
/**
* Read the interactive elements the page currently renders.
*
* Runs inside the page and returns only what a user could act on, so the agent
* cannot be told about an element it cannot reach.
* @returns the current observation.
*/
function observePage() {
	const limit = 80;
	const isVisible = (element) => {
		const style = window.getComputedStyle(element);
		if (style.display === "none" || style.visibility === "hidden") return false;
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	};
	const labelOf = (element) => {
		const aria = element.getAttribute("aria-label");
		if (aria !== null && aria.trim().length > 0) return aria.trim();
		const own = (element.textContent ?? "").replace(/\s+/gu, " ").trim();
		if (own.length > 0) return own;
		const placeholder = element.getAttribute("placeholder");
		if (placeholder !== null && placeholder.trim().length > 0) return placeholder.trim();
		const title = element.getAttribute("title");
		if (title !== null && title.trim().length > 0) return title.trim();
		const name = element.getAttribute("name");
		return name === null ? "" : name;
	};
	const elements = Array.from(document.querySelectorAll("a, button, input, select, textarea, [role=\"button\"], [role=\"link\"], [role=\"tab\"], [tabindex]")).filter(isVisible).slice(0, 60).map((element, index) => ({
		index: index + 1,
		tag: element.tagName.toLowerCase(),
		label: labelOf(element).slice(0, limit),
		fillable: element.tagName.toLowerCase() === "input" || element.tagName.toLowerCase() === "textarea"
	}));
	const headings = Array.from(document.querySelectorAll("h1, h2, h3")).filter(isVisible).map((heading) => (heading.textContent ?? "").replace(/\s+/gu, " ").trim()).filter((text) => text.length > 0).slice(0, 12);
	return {
		title: document.title,
		headings,
		elements,
		textChars: (document.body.textContent ?? "").replace(/\s+/gu, " ").trim().length,
		path: window.location.pathname
	};
}
/** The instruction that fixes the agent's output contract. */
const AGENT_SYSTEM = [
	"You operate a web page for one user with one goal. You see only the interactive",
	"elements the page renders, each with an index. Choose the single next action.",
	"",
	"Reply with JSON and nothing else:",
	"{\"reasoning\":\"<what you expect this action to do, one sentence>\",",
	" \"action\":{\"kind\":\"click\"|\"type\"|\"back\"|\"done\"|\"stuck\",\"index\":<element index>,\"text\":\"<text to type>\"}}",
	"",
	"Rules:",
	"- Name an element by its index from the list you were given. Never invent an element.",
	"- \"done\" only when the goal is reached on the page you can see.",
	"- \"stuck\" when you expected a control or a piece of information that the page does not",
	"  offer: put what you expected and did not find in reasoning. Do not guess a path forward.",
	"- \"index\" is only read for click and type; omit it otherwise.",
	"- Prefer the action that makes progress toward the goal. Repeating an action that did",
	"  not change the page is not progress."
].join("\n");
/**
* Serialize one observation and the history into the turn prompt.
* @param goal - the user's goal.
* @param observation - what the page shows now.
* @param trace - the turns already taken.
* @returns the prompt for one decision.
*/
function buildTurnPrompt(goal, observation, trace) {
	const history = trace.length === 0 ? "(nothing yet)" : trace.map((entry) => String(entry.turn) + ". " + entry.action + " -> " + entry.result).join("\n");
	const elements = observation.elements.length === 0 ? "(no interactive element is visible)" : observation.elements.map((element) => String(element.index) + ". <" + element.tag + "> " + JSON.stringify(element.label) + (element.fillable ? " (accepts text)" : "")).join("\n");
	return [
		"GOAL: " + goal,
		"PAGE: " + observation.title + " (" + observation.path + ", " + String(observation.textChars) + " characters of text)",
		"HEADINGS: " + (observation.headings.length === 0 ? "(none)" : observation.headings.join(" | ")),
		"ELEMENTS:",
		elements,
		"WHAT YOU ALREADY DID:",
		history,
		"Reply with the next action as JSON."
	].join("\n");
}
/** Reject a decision that names something the observation did not offer. */
function parseAction(value, elementCount) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("agent action must be a JSON object");
	const record = value;
	const kind = record["kind"];
	if (kind === "done") return { kind: "done" };
	if (kind === "back") return { kind: "back" };
	if (kind === "stuck") return {
		kind: "stuck",
		reason: typeof record["reason"] === "string" ? record["reason"].trim() : ""
	};
	if (kind === "click" || kind === "type") {
		const index = record["index"];
		if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > elementCount) throw new Error("agent action index " + String(index) + " does not name one of the " + String(elementCount) + " observed elements");
		if (kind === "type") return {
			kind: "type",
			index,
			text: typeof record["text"] === "string" ? record["text"] : ""
		};
		return {
			kind: "click",
			index
		};
	}
	throw new Error("agent action kind " + JSON.stringify(kind ?? null) + " is not one of click, type, back, done, stuck");
}
/**
* Read one decision from the model's reply.
* @param text - the model's reply.
* @param elementCount - how many elements the observation offered.
* @returns the parsed action and the agent's stated reasoning.
*/
function parseDecision(text, elementCount) {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("agent reply contains no JSON object");
	let parsed;
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
	} catch (error) {
		throw new Error("agent reply is not valid JSON: " + (error instanceof Error ? error.message : String(error)));
	}
	const record = parsed;
	const reasoning = typeof record["reasoning"] === "string" ? record["reasoning"].trim() : "";
	if (reasoning.length === 0) throw new Error("agent reply must state its reasoning");
	return {
		reasoning,
		action: parseAction(record["action"], elementCount)
	};
}
/** Render one action the way a reader should see it. */
function describe(action, observation) {
	if (action.kind === "back") return "go back";
	if (action.kind === "done") return "finish the journey";
	if (action.kind === "stuck") return "report an obstacle";
	const element = observation.elements.find((entry) => entry.index === action.index);
	const name = element === void 0 ? "#" + String(action.index) : "<" + element.tag + "> " + JSON.stringify(element.label);
	return action.kind === "click" ? "click " + name : "type " + JSON.stringify(action.text) + " into " + name;
}
/** Execute one action against the page. */
async function perform(page, action, observation) {
	if (action.kind === "back") {
		await page.goBack({ timeout: 1e4 }).catch(() => void 0);
		return "went back";
	}
	if (action.kind === "done") return "finished";
	if (action.kind === "stuck") return "reported an obstacle";
	if (observation.elements.find((entry) => entry.index === action.index) === void 0) return "the element was no longer present";
	const target = page.locator("a, button, input, select, textarea, [role=\"button\"], [role=\"link\"], [role=\"tab\"], [tabindex]").nth(action.index - 1);
	try {
		if (action.kind === "click") await target.click({ timeout: 5e3 });
		else await target.fill(action.text, { timeout: 5e3 });
		return action.kind === "click" ? "clicked" : "typed";
	} catch (error) {
		return "the action failed: " + (error instanceof Error ? error.message.split("\n")[0] ?? "unknown" : String(error));
	}
}
/** Read one observation from the page. */
async function observe(page) {
	await ensurePageHelpers(page);
	return await page.evaluate(observePage);
}
/**
* Drive the page toward one goal until the agent finishes, runs out of turns, or
* stops making progress.
* @param page - the page to operate.
* @param goal - what the user is trying to achieve.
* @param decide - one decision per turn.
* @param options - turn budget and an optional per-turn hook.
* @returns the trace, the obstacles, and why the run stopped.
*/
async function runAgent(page, goal, decide, options = {}) {
	const budget = options.budget ?? 15;
	const trace = [];
	const obstacles = [];
	let repeats = 0;
	let previous = "";
	for (let turn = 1; turn <= budget; turn += 1) {
		const observation = await observe(page);
		const signature = JSON.stringify(observation.elements.map((element) => element.label));
		let reply;
		try {
			reply = await decide(goal, observation, trace);
		} catch (error) {
			trace.push({
				turn,
				reasoning: "the model could not be reached",
				action: "stop",
				result: error instanceof Error ? error.message : String(error),
				changed: false
			});
			return {
				reached: false,
				stopReason: "error",
				trace,
				obstacles
			};
		}
		let decision;
		try {
			decision = parseDecision(reply, observation.elements.length);
		} catch (error) {
			trace.push({
				turn,
				reasoning: "the model did not answer with a usable action",
				action: "stop",
				result: error instanceof Error ? error.message : String(error),
				changed: false
			});
			return {
				reached: false,
				stopReason: "error",
				trace,
				obstacles
			};
		}
		if (decision.action.kind === "done") {
			trace.push({
				turn,
				reasoning: decision.reasoning,
				action: "finish the journey",
				result: "goal reached",
				changed: false
			});
			await options.onTurn?.(trace.at(-1), observation);
			return {
				reached: true,
				stopReason: "goal-reached",
				trace,
				obstacles
			};
		}
		if (decision.action.kind === "stuck") {
			obstacles.push(decision.reasoning);
			const stated = decision.action.kind === "stuck" && decision.action.reason.length > 0 ? decision.action.reason : decision.reasoning;
			trace.push({
				turn,
				reasoning: decision.reasoning,
				action: "report an obstacle",
				result: stated,
				changed: false
			});
			await options.onTurn?.(trace.at(-1), observation);
			return {
				reached: false,
				stopReason: "no-progress",
				trace,
				obstacles
			};
		}
		const result = await perform(page, decision.action, observation);
		const after = await observe(page);
		const changed = JSON.stringify(after.elements.map((element) => element.label)) !== signature || after.path !== observation.path;
		repeats = changed ? 0 : previous === JSON.stringify(decision.action) ? repeats + 1 : 0;
		previous = JSON.stringify(decision.action);
		const entry = {
			turn,
			reasoning: decision.reasoning,
			action: describe(decision.action, observation),
			result,
			changed
		};
		trace.push(entry);
		await options.onTurn?.(entry, observation);
		if (repeats >= 3) {
			obstacles.push("the same action was repeated " + String(repeats + 1) + " times without the page changing: " + entry.action);
			return {
				reached: false,
				stopReason: "no-progress",
				trace,
				obstacles
			};
		}
	}
	return {
		reached: false,
		stopReason: "budget-exhausted",
		trace,
		obstacles
	};
}
/**
* Build a decision function from the harness model service.
* @param llm - the llm service.
* @param route - the provider and model to ask.
* @returns a function returning one reply per turn.
*/
function llmDecide(llm, route) {
	return async (goal, observation, trace) => {
		let text = "";
		for await (const chunk of llm.stream({
			provider: route.provider,
			model: route.model,
			system: AGENT_SYSTEM,
			messages: [{
				role: "user",
				content: [{
					type: "text",
					text: buildTurnPrompt(goal, observation, trace)
				}]
			}],
			signal: new AbortController().signal
		})) if (chunk.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
		return text;
	};
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
	await ensurePageHelpers(page);
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
			await page.goto(action.url, {
				waitUntil: "load",
				timeout: settleTimeoutMs
			});
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
		case "screenshot": return capture(action.caption, action.category, action.selector);
	}
}
/**
* Drive one goal-driven journey with the agent and turn its run into a journey
* outcome. The steps list carries one entry per turn so the report's rail shows
* what the agent did; the trace and the obstacles carry why.
* @param page - the page to operate.
* @param spec - the declared journey, which supplies the goal.
* @param decide - the decision function, absent when no model route is configured.
* @param capture - records one screenshot and returns its evidence id.
* @param behavior - the resolved persona policy.
* @param appliedEnvironment - the conditions the browser actually emulated.
* @returns the settled journey.
*/
async function runGoalJourney(page, spec, decide, capture, behavior, appliedEnvironment) {
	const base = {
		persona: spec.persona,
		device: spec.device,
		name: spec.name,
		behavior,
		behaviorDimensions: behaviorDimensions(behavior),
		...appliedEnvironment.length === 0 ? {} : { appliedEnvironment }
	};
	if (spec.start !== void 0) try {
		await page.goto(spec.start, { timeout: 3e4 });
	} catch (error) {
		return {
			...base,
			steps: [{
				label: "start",
				state: "BLOCKED",
				durationMs: 0,
				error: "the journey could not open " + spec.start + ": " + (error instanceof Error ? error.message : String(error))
			}],
			passed: false,
			trace: [],
			obstacles: [],
			stopReason: "error"
		};
	}
	if (decide === void 0) return {
		...base,
		steps: [{
			label: "agent",
			state: "BLOCKED",
			durationMs: 0,
			error: "the journey declares a goal but no model route is configured, so no agent could run it"
		}],
		passed: false,
		trace: [],
		obstacles: [],
		stopReason: "error"
	};
	const started = Date.now();
	let shots = 0;
	const run = await runAgent(page, spec.goal ?? "", decide, {
		...spec.budget === void 0 ? {} : { budget: spec.budget },
		onTurn: async () => {
			if (shots >= 8) return;
			shots += 1;
			await capture("turn " + String(shots) + ": " + spec.goal, shots === 1 ? "key" : "final");
		}
	});
	const steps = run.trace.map((entry) => {
		const state = entry.action === "finish the journey" ? "PASS" : entry.action === "report an obstacle" ? "FAIL" : entry.changed ? "PASS" : "FAIL";
		return {
			label: entry.action,
			state,
			durationMs: 0,
			...state === "PASS" ? {} : { error: entry.result }
		};
	});
	return {
		...base,
		steps,
		passed: run.reached,
		trace: run.trace,
		obstacles: run.obstacles,
		stopReason: run.stopReason,
		...run.trace.length === 0 ? {} : { settledMs: Date.now() - started }
	};
}
/**
* Execute one declared journey and settle every step.
* @param page - the page to drive.
* @param spec - the declared journey.
* @param persona - the persona name recorded on captures.
* @param capture - screenshot sink.
* @returns the settled journey.
*/
async function runJourney(page, spec, capture, retries, settleTimeoutMs, setActiveStep, behavior, appliedEnvironment) {
	const steps = [];
	let blocked = false;
	for (const step of spec.steps ?? []) {
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
		passed: steps.every((step) => step.state === "PASS"),
		behavior,
		behaviorDimensions: behaviorDimensions(behavior),
		...appliedEnvironment.length === 0 ? {} : { appliedEnvironment }
	};
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
async function markLastCapture(page, shots, findings, masks) {
	const annotations = [];
	for (const [index, finding] of findings.entries()) for (const measured of finding.evidence ?? []) annotations.push({
		label: String(index + 1) + " " + finding.rule,
		severity: finding.severity,
		evidence: measured
	});
	if (annotations.length === 0) return;
	const target = shots.at(-1);
	if (target === void 0) return;
	const result = await captureEvidence(page, annotations, masks);
	if (result.clean === void 0) return;
	const marked = result.annotated === void 0 ? {} : { annotatedDataUri: result.annotated };
	const defects = result.defects.length === 0 ? {} : { integrityDefects: result.defects };
	shots[shots.length - 1] = {
		...target,
		...marked,
		...defects
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
	const masks = options.masks ?? [];
	const browser = await launch(executable);
	try {
		const journeys = [];
		for (const spec of options.journeys) {
			if (options.signal?.aborted === true) throw new Error("experience run cancelled");
			const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
			const behavior = resolveBehavior(spec.behavior);
			const page = await browser.newPage({ viewport });
			const environment = await applyEnvironment(page, behavior.environment);
			const meta = [spec.device, String(viewport.width) + "x" + String(viewport.height)].join(" · ");
			let activeStepLabel = "";
			const capture = async (caption, category, selector) => {
				const focused = selector === void 0 ? await captureFocused(page) : void 0;
				const result = selector === void 0 ? focused?.clean === void 0 ? await captureEvidence(page, [], masks) : focused : await captureElement(page, selector);
				if (result.clean === void 0) return void 0;
				const id = "evidence-" + String(shots.length + 1);
				shots.push({
					id,
					caption,
					category,
					persona: spec.persona,
					journey: spec.name,
					stepLabel: activeStepLabel,
					meta: result.focus === void 0 ? meta : meta + " · " + result.focus,
					dataUri: result.clean,
					...result.annotated === void 0 ? {} : { annotatedDataUri: result.annotated },
					...result.defects.length === 0 ? {} : { integrityDefects: result.defects }
				});
				return id;
			};
			let journey;
			try {
				journey = spec.goal !== void 0 ? await runGoalJourney(page, spec, options.agentDecide, async (caption, category, selector) => capture(caption, category, selector), behavior, environment.applied) : await runJourney(page, spec, async (caption, category, selector) => capture(caption, category, selector), retries, settleTimeoutMs, (label) => {
					activeStepLabel = label;
				}, behavior, environment.applied);
			} finally {
				await environment.restore();
			}
			journeys.push(journey);
			if (options.visualChecks !== false || options.accessibilityChecks !== false) {
				await settle(page, settleTimeoutMs);
				const reachedApp = isAppPage(page.url());
				const visual = !reachedApp || options.visualChecks === false ? [] : await containCheck("visual", () => checkVisual(page));
				const accessibility = !reachedApp || options.accessibilityChecks === false ? [] : await containCheck("accessibility", () => checkAccessibility(page));
				const keyboard = !reachedApp || options.keyboardChecks === false ? [] : await containCheck("keyboard", async () => [...await checkKeyboard(page), ...await probeOpenDialog(page)]);
				const skipped = reachedApp ? [] : [{
					rule: "page-checks-skipped",
					detail: "the journey never reached the app (the page is " + page.url() + "), so page checks would describe the browser error page instead",
					severity: "medium"
				}];
				const findings = [
					...skipped,
					...visual,
					...accessibility,
					...keyboard
				];
				const groups = {
					visual: [...skipped, ...visual],
					accessibility,
					keyboard
				};
				const crops = await captureFindingCrops(page, [
					...groups.visual,
					...groups.accessibility,
					...groups.keyboard
				]);
				let nextCrop = 0;
				const illustrate = (list) => list.map((finding) => {
					const crop = crops[nextCrop];
					nextCrop += 1;
					return crop === void 0 ? finding : {
						...finding,
						cropDataUri: crop
					};
				});
				checks.push({
					persona: spec.persona,
					visual: illustrate(groups.visual),
					accessibility: illustrate(groups.accessibility),
					keyboard: illustrate(groups.keyboard)
				});
				await markLastCapture(page, shots, findings, masks);
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
* @module @cbhdyl/dsh-test-observatory/experience/scoring
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
//#region lib/types/experience/rules.js
/**
* What each deterministic check rule requires and how a page satisfies it.
*
* A finding that only names a rule tells a reader that something is wrong and
* nothing about what to change. Every rule this package emits therefore has one
* entry here, and an axe rule either has one too or carries axe's own
* description and documentation link, so no finding reaches the report without
* a stated requirement.
* @module @cbhdyl/dsh-test-observatory/experience/rules
*/
/** Guidance for the rules this package emits, keyed by rule id. */
const RULES = {
	"image-broken": {
		requirement: "Every image the page requests must load.",
		fix: "Fix the src URL, or remove the image if it is no longer served."
	},
	"image-no-alt": {
		requirement: "Every informative image must carry a text alternative.",
		fix: "Add an alt attribute describing the image, or alt=\"\" when it is decorative."
	},
	"horizontal-overflow": {
		requirement: "The page must not scroll sideways at the tested viewport.",
		fix: "Constrain the element that exceeds the viewport with max-width, or let it wrap."
	},
	"element-outside-viewport": {
		requirement: "Content a user needs must be reachable inside the viewport.",
		fix: "Move the element into the visible area, or make its container scrollable."
	},
	"placeholder-only-field": {
		requirement: "A field must be labelled by something that survives typing.",
		fix: "Add a <label for> or aria-label; a placeholder disappears as soon as the user types."
	},
	"page-checks-skipped": {
		requirement: "Deterministic checks must run against the page.",
		fix: "Inspect why the page could not be inspected; the checks did not evaluate it."
	},
	"keyboard-focus-not-visible": {
		requirement: "A keyboard user must be able to see where focus is.",
		fix: "Give the focused element a visible outline; do not remove it without a replacement."
	},
	"keyboard-dialog-present": {
		requirement: "A dialog must not open without the keyboard user being able to leave it.",
		fix: "Ensure the dialog can be dismissed with Escape and returns focus to its opener."
	},
	"keyboard-focus-trap-missing": {
		requirement: "Focus must stay inside an open modal dialog.",
		fix: "Trap Tab and Shift+Tab within the dialog while it is open."
	},
	"keyboard-escape-ignored": {
		requirement: "Escape must close an open dialog.",
		fix: "Handle Escape on the dialog and restore focus to the element that opened it."
	},
	"evidence-too-small": {
		requirement: "Captured evidence must contain the page it claims to show.",
		fix: "Re-run the journey; this capture is a recording defect, not a product defect."
	},
	"evidence-overlay-left-behind": {
		requirement: "Annotation must not outlive the screenshot it annotates.",
		fix: "Re-run the journey; the annotation overlay leaked into the page."
	},
	"evidence-annotation-missing": {
		requirement: "A finding shown in the report must be marked on its own screenshot.",
		fix: "Re-run the journey; the annotation step did not mark the evidence."
	},
	"evidence-annotation-not-visible": {
		requirement: "The annotation on a screenshot must be visible in the image.",
		fix: "Re-run the journey; the annotation rendered outside the captured area."
	},
	"evidence-size-mismatch": {
		requirement: "A screenshot must match the viewport it was captured at.",
		fix: "Re-run the journey; this capture does not match its declared viewport."
	}
};
/**
* The axe rules the report explains itself, keyed by the bare axe id. A rule
* absent here still reaches the report with axe's own description and link.
*/
const AXE_RULES = {
	"color-contrast": {
		requirement: "Text must be readable against its background.",
		fix: "Darken the text or lighten its background until the measured ratio passes 4.5:1 for body text.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast"
	},
	"image-alt": {
		requirement: "Every informative image must carry a text alternative.",
		fix: "Add a descriptive alt attribute, or alt=\"\" for a purely decorative image.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt"
	},
	"page-has-heading-one": {
		requirement: "A page must name its main subject with one level-one heading.",
		fix: "Mark the visible page title as <h1>, and keep exactly one on the page.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/page-has-heading-one"
	},
	"aria-progressbar-name": {
		requirement: "A progress bar must have an accessible name.",
		fix: "Add aria-label to the element carrying role=\"progressbar\".",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-progressbar-name"
	},
	"button-name": {
		requirement: "A button must have an accessible name.",
		fix: "Add text, aria-label, or a labelled icon inside the button.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name"
	},
	"label": {
		requirement: "Every form field must have an accessible name.",
		fix: "Associate a <label for> or add aria-label to the input.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label"
	},
	"html-has-lang": {
		requirement: "The document must declare its language.",
		fix: "Add a lang attribute to <html>, for example lang=\"en\".",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/html-has-lang"
	},
	"link-name": {
		requirement: "A link must have an accessible name describing its destination.",
		fix: "Add link text or aria-label; \"click here\" is not a name.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/link-name"
	},
	"landmark-one-main": {
		requirement: "The page must expose one main landmark.",
		fix: "Wrap the primary content in <main>.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/landmark-one-main"
	},
	"region": {
		requirement: "All page content must sit inside a landmark region.",
		fix: "Wrap the content in <main>, <nav>, <header>, <footer>, or an equivalent role.",
		helpUrl: "https://dequeuniversity.com/rules/axe/4.10/region"
	}
};
/**
* The guidance for one reported rule.
* @param rule - the rule id as it appears in the report.
* @returns the guidance, or undefined when the rule carries its own description.
*/
function guidanceFor(rule) {
	if (rule.startsWith("axe:")) return AXE_RULES[rule.slice(4)];
	return RULES[rule];
}
/**
* The guidance for one axe violation, preferring this package's own wording and
* falling back to the description axe reported with the violation.
* @param id - the bare axe rule id.
* @param description - axe's own description of what the rule checks.
* @param helpUrl - axe's documentation link for the rule.
* @returns the guidance shown beside the finding.
*/
function axeGuidance(id, description, helpUrl) {
	const known = AXE_RULES[id];
	if (known !== void 0) return helpUrl === void 0 || known.helpUrl !== void 0 ? known : {
		...known,
		helpUrl
	};
	return {
		requirement: description,
		fix: "Follow the rule documentation for the elements listed below.",
		...helpUrl === void 0 ? {} : { helpUrl }
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
	axeGuidance: () => axeGuidance,
	bandFor: () => bandFor,
	checkAccessibility: () => checkAccessibility,
	checkVisual: () => checkVisual,
	collectViolations: () => collectViolations,
	findDuplicateEvidence: () => findDuplicateEvidence,
	guidanceFor: () => guidanceFor,
	launchChromium: () => launchChromium,
	resolveExecutable: () => resolveExecutable,
	runExperience: () => runExperience,
	scoreRun: () => scoreRun
});
//#endregion
export { findDuplicateEvidence as _, SLOW_STEP_MS as a, DEFAULT_STEP_TIMEOUT_MS as c, resolveExecutable as d, runExperience as f, MAX_SHOT_BYTES as g, llmDecide as h, SCORE_DIMENSIONS as i, DEFAULT_VIEWPORT as l, collectViolations as m, axeGuidance as n, bandFor as o, checkVisual as p, guidanceFor as r, scoreRun as s, experience_exports as t, launchChromium as u, checkAccessibility as v };
