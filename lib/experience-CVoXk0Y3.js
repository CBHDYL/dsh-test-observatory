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
const TEXT_LIMIT$1 = 80;
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
	return stripped.length > TEXT_LIMIT$1 ? stripped.slice(0, TEXT_LIMIT$1) + "…" : stripped;
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
//#region lib/types/experience/in-page.js
/**
* Whether an element's computed style draws a visible focus indicator.
* @param style - the element's computed style.
* @returns true when an outline or a shadow would be visible.
*/
function drawsFocusIndicator(style) {
	const isTransparent = (value) => {
		const text = value.trim().toLowerCase();
		if (text === "" || text === "none") return false;
		if (text === "transparent") return true;
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
	const shorthandDrawn = shorthand !== "" && !shorthandSuppressed && shorthandWidthText !== null && (shorthandPixels === void 0 || shorthandPixels > 0) && !isTransparent(shorthand);
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
* @module @deepseek-ai/dsh-experience-runner/behavior
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
	let overlay = await annotate(page, annotations);
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
async function runJourney(page, spec, capture, retries, settleTimeoutMs, setActiveStep, behavior, appliedEnvironment) {
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
			const capture = async (caption, category) => {
				const result = await captureEvidence(page, [], masks);
				if (result.clean === void 0) return void 0;
				const id = "evidence-" + String(shots.length + 1);
				shots.push({
					id,
					caption,
					category,
					persona: spec.persona,
					journey: spec.name,
					stepLabel: activeStepLabel,
					meta,
					dataUri: result.clean,
					...result.annotated === void 0 ? {} : { annotatedDataUri: result.annotated },
					...result.defects.length === 0 ? {} : { integrityDefects: result.defects }
				});
				return id;
			};
			let journey;
			try {
				journey = await runJourney(page, spec, async (caption, category) => capture(caption, category), retries, settleTimeoutMs, (label) => {
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
				checks.push({
					persona: spec.persona,
					visual: [...skipped, ...visual],
					accessibility,
					keyboard
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
export { scoreRun as a, launchChromium as c, checkVisual as d, collectViolations as f, bandFor as i, resolveExecutable as l, checkAccessibility as m, SCORE_DIMENSIONS as n, DEFAULT_STEP_TIMEOUT_MS as o, MAX_SHOT_BYTES as p, SLOW_STEP_MS as r, DEFAULT_VIEWPORT as s, experience_exports as t, runExperience as u };
