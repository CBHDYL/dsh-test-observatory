import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { n as renderReport } from "./render-vvXEZnNy.js";
import { r as runCase, t as buildReportModel } from "./runner-DpJ3qQWm.js";
import { a as scoreRun, u as runExperience } from "./experience-BQkB2ZY0.js";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
//#region lib/types/command/config.js
/**
* Suite-configuration loading and validation. The configuration is an external
* input (a file a human wrote), so every field is validated here rather than
* trusted: a malformed document fails with a message naming the exact problem.
* @module @deepseek-ai/dsh-command-test/config
*/
/** A configuration problem a human must fix; never an internal failure. */
var SuiteConfigError = class extends Error {
	/**
	* @param message - the exact problem, naming the offending field.
	*/
	constructor(message) {
		super(message);
		this.name = "SuiteConfigError";
	}
};
/**
* Read one field from an unknown record.
* @param value - the value to check.
* @returns the value as a record, or null when it is not a mapping.
*/
function asRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value;
}
/**
* Require a non-empty string field.
* @param record - the mapping holding the field.
* @param key - the field name.
* @param where - the position description used in the error.
* @returns the validated string.
*/
function requireString(record, key, where) {
	const value = record[key];
	if (typeof value !== "string" || value.trim().length === 0) throw new SuiteConfigError(`${where}: "${key}" must be a non-empty string`);
	return value;
}
/**
* Read an optional integer field that must be zero or greater. Used for values
* where zero is meaningful, such as an expected exit code.
* @param record - the mapping holding the field.
* @param key - the field name.
* @param where - the position description used in the error.
* @returns the value, or undefined when absent.
*/
function optionalNonNegativeInt(record, key, where) {
	const value = record[key];
	if (value === void 0) return void 0;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new SuiteConfigError(`${where}: "${key}" must be a non-negative integer`);
	return value;
}
/**
* Read an optional integer field that must be greater than zero. A zero timeout,
* viewport dimension or wait duration cannot express the intent the field names,
* so it is rejected rather than silently accepted.
* @param record - the mapping holding the field.
* @param key - the field name.
* @param where - the position description used in the error.
* @returns the value, or undefined when absent.
*/
function optionalPositiveInt(record, key, where) {
	const value = record[key];
	if (value === void 0) return void 0;
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new SuiteConfigError(`${where}: "${key}" must be a positive integer`);
	return value;
}
/**
* Validate one test case.
* @param raw - the raw case value.
* @param index - zero-based position, used in the error.
* @returns the validated case.
*/
function toCase(raw, index) {
	const where = `cases[${index}]`;
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`);
	const name = requireString(record, "name", where);
	const command = requireString(record, "command", where);
	const expectedExitCode = optionalNonNegativeInt(record, "expectedExitCode", where);
	const timeoutMs = optionalPositiveInt(record, "timeoutMs", where);
	const suite = record["suite"];
	const owner = record["owner"];
	const rawResult = record["result"];
	if (suite !== void 0 && typeof suite !== "string") throw new SuiteConfigError(`${where}: "suite" must be a string`);
	if (owner !== void 0 && typeof owner !== "string") throw new SuiteConfigError(`${where}: "owner" must be a string`);
	const result = rawResult === void 0 ? void 0 : toStructuredResult(rawResult, `${where}.result`);
	return {
		name,
		command,
		...expectedExitCode === void 0 ? {} : { expectedExitCode },
		...timeoutMs === void 0 ? {} : { timeoutMs },
		...suite === void 0 ? {} : { suite },
		...owner === void 0 ? {} : { owner },
		...result === void 0 ? {} : { result }
	};
}
/** Validate one structured framework artifact declaration. */
function toStructuredResult(raw, where) {
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`);
	const format = requireString(record, "format", where);
	if (![
		"junit",
		"vitest",
		"jest",
		"playwright",
		"pytest",
		"api",
		"performance",
		"sarif"
	].includes(format)) throw new SuiteConfigError(`${where}.format: must be junit, vitest, jest, playwright, pytest, api or performance`);
	return {
		format,
		path: requireString(record, "path", where)
	};
}
/**
* Validate the report options.
* @param raw - the raw report value.
* @returns the validated options.
*/
function toReportOptions(raw) {
	if (raw === void 0) return {};
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError("report: must be a mapping");
	const options = {};
	for (const key of [
		"title",
		"outputPath",
		"project"
	]) {
		const value = record[key];
		if (value === void 0) continue;
		if (typeof value !== "string" || value.trim().length === 0) throw new SuiteConfigError(`report.${key}: must be a non-empty string`);
		options[key] = value;
	}
	const historyPath = record["historyPath"];
	if (historyPath !== void 0) {
		if (historyPath !== false && (typeof historyPath !== "string" || historyPath.trim().length === 0)) throw new SuiteConfigError("report.historyPath: must be a non-empty string or false");
		options.historyPath = historyPath;
	}
	return options;
}
/**
* Validate a declared persona behaviour: a preset id, or a preset plus overrides.
* @param raw - the raw behaviour value.
* @param where - the position description used in the error.
* @returns the validated declaration.
*/
function toBehavior(raw, where) {
	if (typeof raw === "string") {
		if (raw.trim().length === 0) throw new SuiteConfigError(`${where}.behavior: must be a non-empty string`);
		return raw;
	}
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}.behavior: must be a preset name or a mapping`);
	const override = { preset: requireString(record, "preset", `${where}.behavior`) };
	for (const section of [
		"input",
		"timing",
		"modality",
		"environment",
		"recovery"
	]) {
		const value = record[section];
		if (value === void 0) continue;
		const mapping = asRecord(value);
		if (mapping === null) throw new SuiteConfigError(`${where}.behavior.${section}: must be a mapping`);
		Object.assign(override, { [section]: mapping });
	}
	return override;
}
/**
* Validate one declared journey and its steps.
* @param raw - the raw journey value.
* @param index - zero-based position, used in the error.
* @returns the validated journey.
*/
function toJourney(raw, index) {
	const where = `journeys[${index}]`;
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`);
	const persona = requireString(record, "persona", where);
	const name = requireString(record, "name", where);
	const device = record["device"];
	if (typeof device !== "string" || device.trim().length === 0) throw new SuiteConfigError(`${where}: "device" must be a non-empty string`);
	const rawSteps = record["steps"];
	if (!Array.isArray(rawSteps) || rawSteps.length === 0) throw new SuiteConfigError(`${where}: "steps" must be a non-empty list`);
	const behavior = record["behavior"];
	const declared = behavior === void 0 ? void 0 : toBehavior(behavior, where);
	const viewport = record["viewport"];
	if (viewport !== void 0) {
		const box = asRecord(viewport);
		if (box === null) throw new SuiteConfigError(`${where}.viewport: must be a mapping`);
		const width = optionalPositiveInt(box, "width", `${where}.viewport`);
		const height = optionalPositiveInt(box, "height", `${where}.viewport`);
		if (width === void 0 || height === void 0) throw new SuiteConfigError(`${where}.viewport: "width" and "height" are required`);
	}
	return {
		persona,
		name,
		device,
		...declared === void 0 ? {} : { behavior: declared },
		...viewport === void 0 ? {} : { viewport },
		steps: rawSteps.map((entry, stepIndex) => toStep(entry, `${where}.steps[${stepIndex}]`))
	};
}
/**
* Validate one journey step and its actions.
* @param raw - the raw step value.
* @param where - the position description used in the error.
* @returns the validated step.
*/
function toStep(raw, where) {
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`);
	const label = requireString(record, "label", where);
	const actions = record["actions"];
	if (!Array.isArray(actions) || actions.length === 0) throw new SuiteConfigError(`${where}: "actions" must be a non-empty list`);
	const timeoutMs = optionalPositiveInt(record, "timeoutMs", where);
	return {
		label,
		...timeoutMs === void 0 ? {} : { timeoutMs },
		actions: actions.map((entry, actionIndex) => toAction(entry, `${where}.actions[${actionIndex}]`))
	};
}
/**
* Validate one journey action.
* @param raw - the raw action value.
* @param where - the position description used in the error.
* @returns the validated action.
*/
function toAction(raw, where) {
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError(`${where}: must be a mapping`);
	switch (record["kind"]) {
		case "goto": return {
			kind: "goto",
			url: requireString(record, "url", where)
		};
		case "click": return {
			kind: "click",
			selector: requireString(record, "selector", where)
		};
		case "expectVisible": return {
			kind: "expectVisible",
			selector: requireString(record, "selector", where)
		};
		case "expectText": return {
			kind: "expectText",
			text: requireString(record, "text", where)
		};
		case "fill": return {
			kind: "fill",
			selector: requireString(record, "selector", where),
			value: requireString(record, "value", where)
		};
		case "wait": {
			const ms = optionalPositiveInt(record, "ms", where);
			const selector = record["selector"];
			if (selector !== void 0 && (typeof selector !== "string" || selector.trim().length === 0)) throw new SuiteConfigError(`${where}: "selector" must be a non-empty string`);
			return {
				kind: "wait",
				...ms === void 0 ? {} : { ms },
				...selector === void 0 ? {} : { selector }
			};
		}
		case "screenshot": {
			const category = record["category"];
			if (category !== "key" && category !== "fail" && category !== "mobile" && category !== "final") throw new SuiteConfigError(`${where}: "category" must be key, fail, mobile or final`);
			return {
				kind: "screenshot",
				caption: requireString(record, "caption", where),
				category
			};
		}
		default: throw new SuiteConfigError(`${where}: "kind" must be goto, click, fill, expectText, expectVisible, wait or screenshot`);
	}
}
/**
* Parse and validate a suite configuration document.
* @param text - the YAML document text.
* @returns the validated configuration.
*/
function parseSuiteConfig(text) {
	let raw;
	try {
		raw = parse(text);
	} catch (error) {
		throw new SuiteConfigError(`not valid YAML: ${error.message}`);
	}
	const record = asRecord(raw);
	if (record === null) throw new SuiteConfigError("the document must be a mapping with a \"cases\" list");
	const cases = record["cases"];
	if (!Array.isArray(cases)) throw new SuiteConfigError("\"cases\" must be a list of test cases");
	if (cases.length === 0) throw new SuiteConfigError("\"cases\" must declare at least one test case");
	const rawJourneys = record["journeys"];
	if (rawJourneys !== void 0 && !Array.isArray(rawJourneys)) throw new SuiteConfigError("\"journeys\" must be a list of browser journeys");
	return {
		report: toReportOptions(record["report"]),
		cases: cases.map((entry, index) => toCase(entry, index)),
		...rawJourneys === void 0 ? {} : { journeys: rawJourneys.map((entry, index) => toJourney(entry, index)) }
	};
}
/**
* Read and validate a suite configuration file.
* @param path - absolute or relative path of the configuration file.
* @returns the validated configuration.
*/
async function loadSuiteConfig(path) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") throw new SuiteConfigError(`no configuration file at ${path}`);
		throw new SuiteConfigError(`cannot read ${path}: ${error.message}`);
	}
	return parseSuiteConfig(text);
}
//#endregion
//#region lib/types/command/experience.js
/**
* Map a settled human-simulation run into the report model's experience
* section: score, persona cards, journey rails, evidence gallery and findings.
* @module @deepseek-ai/dsh-command-test/experience
*/
/**
* Build a stable persona id from a display name. Unicode letters and digits are
* kept, so a non-Latin persona name stays distinct instead of collapsing onto
* the same fallback id as every other non-Latin name.
* @param name - the persona display name.
* @returns a lowercase slug usable as a data attribute.
*/
function personaId(name) {
	return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "persona";
}
/**
* Turn one failed step into a finding.
* @param journey - the journey that owns the step.
* @param label - the failed step label.
* @param error - the observed failure message.
* @param index - position, used for the finding id.
* @returns the finding.
*/
function toFinding(journey, label, error, index) {
	return {
		id: "finding-" + String(index + 1),
		severity: "HIGH",
		dimension: "Feedback & recovery",
		deductedPoints: 2,
		title: label + " failed for " + journey.persona,
		observation: error,
		scope: journey.name + " · " + journey.persona,
		recoverablePoints: 2,
		evidenceIds: journey.steps.find((step) => step.label === label)?.evidenceIds ?? []
	};
}
/**
* Map a settled run into the report's experience section.
* @param run - the settled human-simulation run.
* @returns the section, ready to spread into the report model.
*/
function toExperienceSection(run) {
	const score = scoreRun(run);
	const personas = run.journeys.map((journey) => ({
		id: personaId(journey.persona),
		name: journey.persona,
		device: journey.device,
		tasks: journey.steps.length,
		completionPercent: journey.steps.length === 0 ? 0 : Math.round(journey.steps.filter((step) => step.state === "PASS").length / journey.steps.length * 100),
		headline: journey.passed ? "Completed" : "Blocked",
		behaviorId: journey.behavior.id,
		...journey.behaviorDimensions.length === 0 ? {} : { behaviorDimensions: journey.behaviorDimensions }
	}));
	const journeys = run.journeys.map((journey) => ({
		personaId: personaId(journey.persona),
		name: journey.name,
		steps: journey.steps.map((step) => ({
			label: step.label,
			state: step.state,
			seconds: step.state === "BLOCKED" ? null : Math.round(step.durationMs / 10) / 100,
			...step.evidenceIds === void 0 ? {} : { evidenceIds: step.evidenceIds }
		}))
	}));
	const evidence = run.shots.map((shot) => ({
		id: shot.id,
		title: shot.caption,
		personaId: personaId(shot.persona),
		journey: shot.journey,
		stepLabel: shot.stepLabel,
		kind: shot.category,
		meta: shot.meta,
		imageDataUri: shot.dataUri,
		...shot.annotatedDataUri === void 0 ? {} : { annotatedImageDataUri: shot.annotatedDataUri },
		...shot.integrityDefects === void 0 ? {} : { integrityDefects: shot.integrityDefects }
	}));
	const findings = run.journeys.flatMap((journey, journeyIndex) => journey.steps.filter((step) => step.state === "FAIL").map((step, stepIndex) => toFinding(journey, step.label, step.error ?? "step did not settle", journeyIndex * 100 + stepIndex)));
	const seen = /* @__PURE__ */ new Set();
	const checks = [];
	for (const entry of run.checks) for (const [family, findings] of [
		["visual", entry.visual],
		["accessibility", entry.accessibility],
		["keyboard", entry.keyboard]
	]) for (const finding of findings) {
		const key = family + "|" + finding.rule + "|" + finding.detail;
		if (seen.has(key)) continue;
		seen.add(key);
		const evidence = (finding.evidence ?? []).map((entryEvidence) => ({
			tag: entryEvidence.element.tag,
			selector: entryEvidence.element.selector,
			...entryEvidence.element.text === void 0 ? {} : { text: entryEvidence.element.text },
			box: entryEvidence.box
		}));
		checks.push({
			rule: finding.rule,
			detail: finding.detail,
			severity: finding.severity,
			family,
			persona: entry.persona,
			...evidence.length === 0 ? {} : { evidence }
		});
	}
	return {
		experience: score,
		personas,
		journeys,
		evidence,
		findings,
		checks
	};
}
//#endregion
//#region lib/types/command/detect.js
/**
* Project detection for `/test auto`: read the working directory's manifests and
* propose the suite declaration a project of that shape would want. Detection
* only proposes commands the project already declares; it never invents one.
* @module @deepseek-ai/dsh-command-test/detect
*/
/**
* Read a file, returning undefined when it is absent or unreadable.
* @param path - the file path.
* @returns the file text, or undefined.
*/
async function readOptional(path) {
	try {
		return await readFile(path, "utf8");
	} catch {
		return;
	}
}
/**
* Extract the npm scripts a Node project declares.
* @param directory - the project directory.
* @returns the package name and script names, or undefined when not a Node project.
*/
async function detectNode(directory) {
	const text = await readOptional(join(directory, "package.json"));
	if (text === void 0) return void 0;
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return {
			name: "Node project",
			scripts: []
		};
	}
	if (typeof parsed !== "object" || parsed === null) return {
		name: "Node project",
		scripts: []
	};
	const record = parsed;
	return {
		name: typeof record.name === "string" && record.name.length > 0 ? record.name : "Node project",
		scripts: typeof record.scripts === "object" && record.scripts !== null ? Object.keys(record.scripts) : []
	};
}
/**
* Build the Node checks from the declared scripts, preferring the conventional
* verification script names in the order a maintainer would run them.
* @param scripts - the declared script names.
* @returns the detected checks.
*/
function nodeChecks(scripts) {
	return [
		"test",
		"typecheck",
		"lint",
		"build"
	].filter((name) => scripts.includes(name)).map((name) => ({
		name: "pnpm run " + name,
		command: "pnpm run " + name,
		suite: name === "test" ? "Unit" : "Static"
	}));
}
/**
* Detect the checks a project directory declares.
* @param directory - the session working directory.
* @returns the detection result.
*/
async function detectProject(directory) {
	const node = await detectNode(directory);
	if (node !== void 0) return {
		projectType: node.name,
		checks: nodeChecks(node.scripts)
	};
	if (await readOptional(join(directory, "pyproject.toml")) !== void 0) return {
		projectType: "Python project",
		checks: [{
			name: "pytest",
			command: "python3 -m pytest",
			suite: "Unit"
		}]
	};
	if (await readOptional(join(directory, "go.mod")) !== void 0) return {
		projectType: "Go module",
		checks: [{
			name: "go test",
			command: "go test ./...",
			suite: "Unit"
		}, {
			name: "go vet",
			command: "go vet ./...",
			suite: "Static"
		}]
	};
	if (await readOptional(join(directory, "Cargo.toml")) !== void 0) return {
		projectType: "Cargo package",
		checks: [{
			name: "cargo test",
			command: "cargo test",
			suite: "Unit"
		}, {
			name: "cargo clippy",
			command: "cargo clippy -- -D warnings",
			suite: "Static"
		}]
	};
	return {
		projectType: "unrecognized project",
		checks: []
	};
}
/**
* Render a detection as the YAML declaration a human can paste and run.
* @param detection - what detection found.
* @param directory - the directory that was inspected, used in the heading.
* @returns the report text.
*/
function describeDetection(detection, directory) {
	if (detection.checks.length === 0) return [
		"No runnable checks detected in " + directory + " (" + detection.projectType + ").",
		"Declare them yourself in test-observatory.yml:",
		"",
		"  cases:",
		"    - name: Unit tests",
		"      command: <your test command>"
	].join("\n");
	const lines = [
		"Detected " + detection.projectType + " in " + directory + ":",
		...detection.checks.map((check) => "  - " + check.name + "  (" + check.command + ")"),
		"",
		"Paste this into test-observatory.yml, then run /test:",
		"",
		"report:",
		"  project: " + detection.projectType,
		"  outputPath: test-observatory-report.html",
		"cases:"
	];
	for (const check of detection.checks) {
		lines.push("  - name: " + check.name);
		lines.push("    command: " + check.command);
		lines.push("    suite: " + check.suite);
	}
	return lines.join("\n");
}
//#endregion
//#region lib/types/command/junit.js
/** Decode the five XML entities a JUnit document uses. */
function decode(value) {
	return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
/** Read one attribute from an element's attribute text. */
function attr(attributes, key) {
	const match = new RegExp("\\s" + key + "=[\"']([^\"']*)[\"']").exec(attributes);
	return match?.[1] === void 0 || match[1].length === 0 ? void 0 : match[1];
}
/** Strip the CDATA wrapper a failure body may carry. */
function unwrapCdata(value) {
	return value.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}
/** Whether the document was cut off before its root element closed. */
function isTruncated(source) {
	return (source.match(/<(testsuites?)\b/g) ?? []).length > (source.match(/<\/(testsuites?)>/g) ?? []).length;
}
/**
* Parse a JUnit document into cases.
*
* Case order follows the document, so a report shows the producer's own order.
* @param source - the document text.
* @returns every case the document declares.
* @throws when the document is truncated, because a truncated document cannot be
*   distinguished from a fully passing one by its cases alone.
*/
function parseJUnitDocument(source) {
	if (isTruncated(source)) throw new Error("the JUnit document is truncated: its root element never closed, so its cases cannot be trusted");
	const cases = [];
	for (const match of source.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
		const attributes = match[1] ?? "";
		const body = match[2] ?? "";
		const failure = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(failure|error)>)/.exec(body);
		const name = attr(attributes, "name");
		if (name === void 0) continue;
		const skipped = /<skipped\b/.test(body);
		const status = failure !== null ? "failed" : skipped ? "skipped" : "passed";
		const bodyText = failure?.[3] === void 0 ? void 0 : unwrapCdata(failure[3]);
		const message = failure === null ? void 0 : attr(failure[2] ?? "", "message");
		const error = bodyText !== void 0 && bodyText.length > 0 ? bodyText : message;
		const classname = attr(attributes, "classname");
		const file = attr(attributes, "file");
		const time = Number(attr(attributes, "time"));
		const reruns = (body.match(/<rerunFailure\b|<flakyFailure\b|<rerunError\b|<flakyError\b/g) ?? []).length;
		cases.push({
			name: decode(name),
			...classname === void 0 ? {} : { classname: decode(classname) },
			...file === void 0 ? {} : { file: decode(file) },
			status,
			...Number.isFinite(time) ? { durationSeconds: time } : {},
			...error === void 0 ? {} : { error: decode(error) },
			...reruns > 0 ? { attempts: reruns + 1 } : {}
		});
	}
	return cases;
}
//#endregion
//#region lib/types/command/sarif.js
/**
* SARIF 2.1.0 parsing.
*
* SARIF is the only findings format standardised by a standards body, which is
* why several unrelated tools — linters, vulnerability scanners, security
* analysers — can all be read through this one parser. Each result becomes a
* report row so a lint or security finding appears beside the tests rather than
* in a separate tool nobody opens.
*
* The version is checked rather than assumed: 2.2 has not been released, so a
* document claiming it is a producer error worth surfacing.
* @module @cbhdyl/dsh-test-observatory/command/sarif
*/
/** Result levels this parser accepts. */
const LEVELS = /* @__PURE__ */ new Set([
	"error",
	"warning",
	"note",
	"none"
]);
/** Read a string field from an unknown value. */
function text$1(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
/** Read an object field from an unknown value. */
function record$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** Read an array field from an unknown value. */
function array$1(value) {
	return Array.isArray(value) ? value : [];
}
/** Read a finite number from an unknown value. */
function count$1(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/**
* Turn the location a scanner reports into a path a reader can compare with
* their own tree.
*
* Scanners report a URI, and several — Ruff among them — report an absolute
* `file://` one, which says nothing about where the file sits in the project.
* The workspace prefix is therefore stripped when the location is inside it, and
* a relative location is kept as it is.
* @param uri - the reported location.
* @param root - absolute workspace path, without a trailing separator.
* @returns a workspace-relative path, or the original when it is not inside.
*/
function normaliseLocation(uri, root) {
	let path = uri;
	if (path.startsWith("file://")) try {
		path = decodeURIComponent(new URL(path).pathname);
	} catch {
		path = path.slice(7);
	}
	if (root !== void 0 && root.length > 0) {
		const prefix = root.endsWith("/") ? root : root + "/";
		if (path.startsWith(prefix)) return path.slice(prefix.length);
	}
	return path;
}
/**
* Parse a SARIF 2.1.0 document into findings.
* @param value - the parsed JSON document.
* @returns every finding the document reports.
* @throws when the document is not SARIF, or declares a version this parser does
*   not implement.
*/
function parseSarif(value, workspace) {
	const document = record$1(value);
	if (document === void 0 || text$1(document["version"]) === void 0) throw new Error("the artifact is not a SARIF document: it declares no version");
	const version = text$1(document["version"]);
	if (version !== "2.1.0") throw new Error("unsupported SARIF version \"" + version + "\"; this parser implements 2.1.0");
	const findings = [];
	for (const rawRun of array$1(document["runs"])) {
		const run = record$1(rawRun);
		if (run === void 0) continue;
		const toolName = text$1(record$1(record$1(run["tool"])?.["driver"])?.["name"]) ?? "sarif";
		for (const rawResult of array$1(run["results"])) {
			const result = record$1(rawResult);
			if (result === void 0) continue;
			const ruleId = text$1(result["ruleId"]) ?? toolName;
			const message = text$1(record$1(result["message"])?.["text"]) ?? text$1(record$1(result["message"])?.["markdown"]) ?? ruleId;
			const declared = text$1(result["level"]);
			const level = declared !== void 0 && LEVELS.has(declared) ? declared : "warning";
			const physical = record$1(record$1(array$1(result["locations"])[0])?.["physicalLocation"]);
			const artifact = record$1(physical?.["artifactLocation"]);
			const region = record$1(physical?.["region"]);
			const rawFile = text$1(artifact?.["uri"]);
			const file = rawFile === void 0 ? void 0 : normaliseLocation(rawFile, workspace);
			const line = count$1(region?.["startLine"]);
			findings.push({
				rule: ruleId,
				level,
				message,
				...file === void 0 ? {} : { file },
				...line === void 0 ? {} : { line }
			});
		}
	}
	return findings;
}
//#endregion
//#region lib/types/command/snapshots.js
/**
* Snapshot counts from a Jest-shaped JSON report.
*
* A snapshot failure reaches a report as one failed test among hundreds, and the
* two situations behind it need opposite responses: a mismatch means a real
* behavioural change slipped in, while an unchecked entry means a baseline was
* created or has gone stale — the second is normal right after a merge and the
* first never is. Naming which happened is the whole point of reading the field.
*
* The field names are the ones Jest publishes and Vitest reproduces; they were
* confirmed against a real Vitest JSON report rather than assumed.
* @module @cbhdyl/dsh-test-observatory/command/snapshots
*/
/** Read a non-negative integer from an unknown value. */
function count(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
/**
* Read the snapshot counts a report declares.
* @param value - the parsed report document.
* @returns the counts, or undefined when the document reports none, which is
*   how a project with no snapshot tests looks.
*/
function readSnapshotCounts(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
	const raw = value.snapshot;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
	const record = raw;
	return {
		matched: count(record["matched"]),
		added: count(record["added"]),
		unmatched: count(record["unmatched"]),
		updated: count(record["updated"]),
		unchecked: count(record["unchecked"]) + count(record["filesUnmatched"]),
		total: count(record["total"])
	};
}
/**
* A one-line statement of what the snapshots did, for a report summary.
*
* It states only what the counts support. A baseline that was written is not
* described as verified, because nothing compared it to anything.
* @param counts - the parsed counts, or undefined when the report had none.
* @returns the sentence, or undefined when there is nothing to say.
*/
function describeSnapshots(counts) {
	if (counts === void 0 || counts.total === 0) return void 0;
	const parts = [];
	if (counts.matched > 0) parts.push(String(counts.matched) + " compared");
	if (counts.unmatched > 0) parts.push(String(counts.unmatched) + " did not match");
	if (counts.added > 0) parts.push(String(counts.added) + " written for the first time");
	if (counts.unchecked > 0) parts.push(String(counts.unchecked) + " not compared (a baseline was created, or its test is gone)");
	if (counts.updated > 0) parts.push(String(counts.updated) + " refreshed");
	if (parts.length === 0) return void 0;
	return "Snapshots: " + parts.join(", ") + ".";
}
//#endregion
//#region lib/types/command/structured.js
/** Parse framework artifacts into report-level test results. */
const text = (value) => typeof value === "string" && value.length > 0 ? value : void 0;
const number = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
const array = (value) => Array.isArray(value) ? value : [];
const status = (value) => {
	const normalized = String(value ?? "").toLowerCase();
	if (normalized.includes("skip") || normalized === "pending" || normalized === "disabled" || normalized === "todo") return "skipped";
	if (normalized.includes("flaky")) return "flaky";
	if (normalized === "passed" || normalized === "pass" || normalized === "ok" || normalized === "expected") return "passed";
	return "failed";
};
function parsePlaywright(value, out, inherited = "", inheritedFile) {
	const item = record(value);
	if (!item) {
		for (const child of array(value)) parsePlaywright(child, out, inherited, inheritedFile);
		return;
	}
	const title = text(item["title"]) ?? text(item["name"]);
	const nextSuite = title === void 0 ? inherited : inherited.length === 0 ? title : inherited + " › " + title;
	const currentFile = text(item["file"]) ?? inheritedFile;
	const tests = array(item["tests"]);
	for (const rawTest of tests) {
		const test = record(rawTest);
		if (!test) continue;
		const results = array(test["results"]).map(record).filter((result) => result !== void 0);
		const last = results.at(-1);
		const states = results.map((result) => status(result["status"]));
		const finalStatus = states.at(-1) === "passed" && states.some((state) => state === "failed") ? "flaky" : status(test["status"] ?? last?.["status"]);
		const errors = array(last?.["errors"]).map((error) => text(record(error)?.["message"]) ?? text(error)).filter((error) => error !== void 0);
		const attachments = results.flatMap((result) => array(result["attachments"])).flatMap((raw) => {
			const attachment = record(raw);
			const path = text(attachment?.["path"]);
			if (!path) return [];
			const contentType = text(attachment?.["contentType"]) ?? "";
			const kind = contentType.startsWith("image/") ? "screenshot" : contentType.startsWith("video/") ? "video" : path.endsWith(".zip") ? "trace" : "other";
			return [{
				name: text(attachment?.["name"]) ?? path.split("/").pop() ?? "attachment",
				kind,
				path
			}];
		});
		const duration = (number(last?.["duration"]) ?? 0) / 1e3;
		out.push({
			name: title ?? text(test["title"]) ?? "unnamed test",
			suite: inherited,
			status: finalStatus,
			durationSeconds: duration,
			attempts: Math.max(1, results.length),
			...currentFile ? { path: currentFile } : {},
			...errors.length ? { error: errors.join("\n") } : {},
			...attachments.length ? { attachments } : {}
		});
	}
	for (const key of ["suites", "specs"]) for (const child of array(item[key])) parsePlaywright(child, out, nextSuite, currentFile);
}
function visit(value, framework, out, inherited = "", inheritedFile) {
	const item = record(value);
	if (!item) {
		for (const child of array(value)) visit(child, framework, out, inherited, inheritedFile);
		return;
	}
	const title = text(item["fullName"]) ?? text(item["title"]) ?? text(item["name"]);
	const location = record(item["location"]);
	const file = text(item["file"]) ?? text(item["filePath"]) ?? text(location?.["file"]) ?? inheritedFile ?? (framework === "jest" || framework === "vitest" ? text(item["name"]) : void 0);
	const state = item["status"] ?? item["state"] ?? item["outcome"];
	const durationMs = number(item["duration"]) ?? number(record(item["duration"])?.["milliseconds"]);
	const errors = [...array(item["errors"]), ...array(item["failureMessages"])].map((x) => text(record(x)?.["message"]) ?? text(x)).filter((x) => x !== void 0);
	const directError = text(item["failureMessage"]) ?? text(item["error"]) ?? (errors.length === 0 ? void 0 : errors.join("\n"));
	const attempts = array(item["results"]).length || number(item["retry"]);
	const attachments = array(item["attachments"]).flatMap((raw) => {
		const a = record(raw);
		const path = text(a?.["path"]);
		if (!path) return [];
		const contentType = text(a?.["contentType"]) ?? "";
		const kind = contentType.startsWith("image/") ? "screenshot" : contentType.startsWith("video/") ? "video" : path.endsWith(".zip") ? "trace" : "other";
		return [{
			name: text(a?.["name"]) ?? path.split("/").pop() ?? "attachment",
			kind,
			path
		}];
	});
	const children = [
		"testResults",
		"assertionResults",
		"suites",
		"specs",
		"tests",
		"results",
		"children"
	].flatMap((key) => array(item[key]));
	if (title && state !== void 0 && children.length === 0) out.push({
		name: title,
		status: status(state),
		...file ? { path: file } : {},
		...inherited ? { suite: inherited } : {},
		...durationMs === void 0 ? {} : { durationSeconds: durationMs / 1e3 },
		...directError ? { error: directError } : {},
		...attempts ? { attempts } : {},
		...attachments.length ? { attachments } : {}
	});
	const nextSuite = title && state === void 0 ? title : inherited;
	for (const child of children) visit(child, framework, out, nextSuite, file);
}
function parseApi(value) {
	return array(record(value)?.["results"] ?? value).flatMap((raw) => {
		const item = record(raw);
		if (!item) return [];
		const method = text(item["method"]) ?? "GET", url = text(item["url"]);
		const actualStatus = number(item["status"]) ?? number(item["actualStatus"]);
		if (!url || actualStatus === void 0) return [];
		const expectedStatus = number(item["expectedStatus"]), durationMs = number(item["durationMs"]);
		const api = {
			method,
			url,
			actualStatus,
			...expectedStatus === void 0 ? {} : { expectedStatus },
			...durationMs === void 0 ? {} : { durationMs }
		};
		const error = text(item["error"]);
		return [{
			name: text(item["name"]) ?? method + " " + url,
			path: url,
			suite: "API",
			status: error === void 0 && (expectedStatus === void 0 || expectedStatus === actualStatus) ? "passed" : "failed",
			durationSeconds: (durationMs ?? 0) / 1e3,
			api,
			...error ? { error } : {}
		}];
	});
}
function parsePerformance(value) {
	return array(record(value)?.["results"] ?? value).flatMap((raw) => {
		const item = record(raw);
		if (!item) return [];
		const metric = text(item["metric"]) ?? text(item["name"]), measured = number(item["value"]);
		if (!metric || measured === void 0) return [];
		const unit = text(item["unit"]) ?? "ms", threshold = number(item["threshold"]), direction = item["direction"] === "min" ? "min" : "max";
		const passed = threshold === void 0 || (direction === "max" ? measured <= threshold : measured >= threshold);
		const performance = {
			metric,
			value: measured,
			unit,
			direction,
			...threshold === void 0 ? {} : { threshold },
			...number(item["p50"]) === void 0 ? {} : { p50: number(item["p50"]) },
			...number(item["p95"]) === void 0 ? {} : { p95: number(item["p95"]) },
			...number(item["p99"]) === void 0 ? {} : { p99: number(item["p99"]) },
			...number(item["throughput"]) === void 0 ? {} : { throughput: number(item["throughput"]) }
		};
		return [{
			name: text(item["name"]) ?? metric,
			path: metric,
			suite: "Performance",
			status: passed ? "passed" : "failed",
			durationSeconds: 0,
			performance,
			...passed ? {} : { error: metric + " " + measured + unit + " breached " + direction + " " + threshold + unit }
		}];
	});
}
/**
* Infer a Pytest source file from a JUnit `classname` attribute. Pytest reports
* a dotted module path for function-style tests (`tests.test_foo`) and appends
* a trailing PascalCase segment for unittest-style class tests
* (`tests.test_foo.TestBar`); the class segment is not part of the file path.
* A classname with no dot is a declared suite label rather than a module path,
* and is intentionally not converted to a file.
* @param classname - the JUnit `classname` attribute value.
* @returns the inferred `.py` path, or undefined when inference would be unreliable.
*/
function inferPytestPath(classname) {
	const segments = classname.split(".");
	if (segments.length < 2) return void 0;
	const last = segments.at(-1);
	const modulePathSegments = /^[A-Z]/.test(last) ? segments.slice(0, -1) : segments;
	if (modulePathSegments.length === 0) return void 0;
	return modulePathSegments.join("/") + ".py";
}
/**
* Read and parse one declared structured result artifact.
* @param spec - the declared format and path.
* @param testCase - the declaring case, supplying suite and owner defaults.
* @param cwd - the directory the path is resolved against.
* @returns the rows and any snapshot counts the artifact declared.
*/
async function readStructuredResult(spec, testCase, cwd) {
	const source = await readFile(resolve(cwd, spec.path), "utf8");
	const parsed = spec.format === "junit" || spec.format === "pytest" ? parseJUnitDocument(source).map((entry) => ({
		name: entry.name,
		...entry.file === void 0 ? {} : { path: entry.file },
		...entry.classname === void 0 ? {} : { suite: entry.classname },
		status: entry.status,
		...entry.durationSeconds === void 0 ? {} : { durationSeconds: entry.durationSeconds },
		...entry.error === void 0 ? {} : { error: entry.error },
		...entry.attempts === void 0 ? {} : { attempts: entry.attempts }
	})) : (() => {
		const value = JSON.parse(source);
		if (spec.format === "api") return parseApi(value);
		if (spec.format === "performance") return parsePerformance(value);
		if (spec.format === "sarif") return parseSarif(value, cwd).map((finding) => ({
			name: finding.rule + (finding.file === void 0 ? "" : " · " + finding.file + (finding.line === void 0 ? "" : ":" + String(finding.line))),
			path: finding.file ?? finding.rule,
			suite: "Static analysis",
			status: finding.level === "error" || finding.level === "warning" ? "failed" : "passed",
			...finding.level === "error" || finding.level === "warning" ? { error: finding.message } : {}
		}));
		const out = [];
		if (spec.format === "playwright") parsePlaywright(value, out);
		else visit(value, spec.format, out);
		return out;
	})();
	if (parsed.length === 0) throw new Error(`structured result ${spec.path} contains no recognizable test results`);
	const tests = parsed.map((item) => ({
		name: item.name,
		path: item.path ?? (spec.format === "pytest" && item.suite ? inferPytestPath(item.suite) ?? spec.path : spec.path),
		status: item.status,
		suite: item.suite || testCase.suite || spec.format,
		durationSeconds: item.durationSeconds ?? 0,
		owner: testCase.owner ?? "Unassigned",
		framework: spec.format,
		...item.error ? { error: item.error } : {},
		...item.attempts ? { attempts: item.attempts } : {},
		...item.attachments?.length ? { attachments: item.attachments } : {},
		...item.api ? { api: item.api } : {},
		...item.performance ? { performance: item.performance } : {}
	}));
	const snapshots = spec.format === "jest" || spec.format === "vitest" ? readSnapshotCounts(JSON.parse(source)) : void 0;
	return {
		tests,
		...snapshots === void 0 ? {} : { snapshots }
	};
}
//#endregion
//#region lib/types/command/history.js
/**
* Persist and compare bounded Test Observatory run history.
*
* Only the status a run actually reported is stored. An earlier version also
* rewrote a currently-passing test to `flaky` when recent runs disagreed; that
* made the stored status a derived value, so `passed`/`failed` comparisons
* stopped matching and a genuine regression could never be reported again.
* Flakiness is not decidable from a handful of runs, so this module reports
* only what it observed: a status change between the previous run and this one.
* The single-run instability signal the report shows is the per-test attempt
* count a framework itself reported, never an inferred flaky verdict.
* @module @deepseek-ai/dsh-command-test/history
*/
/**
* Stable identity of one test across runs.
* @param test - the test to key.
* @returns the identity string.
*/
const key = (test) => test.path + "::" + test.name;
/**
* Compare a report with the previous run, persist it, and return the
* history-derived fields. The current run's own statuses are returned unchanged.
* @param path - the history file to read and replace.
* @param model - the report being written.
* @returns the trend, the changes since the previous run, and the unchanged tests.
*/
async function projectHistory(path, model) {
	let history = {
		version: 1,
		runs: []
	};
	try {
		history = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const previous = history.runs.at(-1);
	const prior = new Map((previous?.tests ?? []).map((test) => [key(test), test]));
	const regressions = [];
	const recovered = [];
	for (const test of model.tests) {
		const old = prior.get(key(test));
		if (old?.status === "passed" && test.status === "failed") regressions.push({
			name: test.name,
			scope: test.suite,
			severity: "HIGH"
		});
		if (old?.status === "failed" && test.status === "passed") recovered.push({
			name: test.name,
			evidence: "Passed after failing in " + String(previous?.runId)
		});
	}
	const snapshot = {
		runId: model.meta.runId,
		runAt: model.meta.runAt,
		score: model.verdict.score,
		durationSeconds: model.summary.durationSeconds,
		tests: model.tests.map(({ name, path: testPath, status }) => ({
			name,
			path: testPath,
			status
		}))
	};
	const runs = [...history.runs, snapshot].slice(-20);
	await mkdir(dirname(path), { recursive: true });
	const temporaryPath = path + ".tmp-" + String(process.pid) + "-" + String(Date.now());
	try {
		await writeFile(temporaryPath, JSON.stringify({
			version: 1,
			runs
		}, null, 2) + "\n");
		await rename(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => void 0);
		throw error;
	}
	return {
		trend: runs.map((run) => ({
			run: run.runId,
			score: run.score,
			durationSeconds: run.durationSeconds
		})),
		regressions,
		recovered,
		tests: model.tests
	};
}
//#endregion
//#region lib/types/command/index.js
/**
* Human-facing `/test` command: execute a declared command suite and write a
* Test Observatory HTML report. The command is the human entry point; the
* report renderer owns the document, and this package owns configuration
* loading, execution and where the file lands.
* @module @deepseek-ai/dsh-command-test
*/
var command_exports = /* @__PURE__ */ __exportAll({
	apply: () => apply,
	inject: () => inject,
	name: () => name
});
const name = "command-test";
const inject = ["commands"];
/** Default configuration file name looked up in the working directory. */
const DEFAULT_CONFIG = "test-observatory.yml";
const USAGE = `Usage: /test [<config-file>]
  /test                     run ./${DEFAULT_CONFIG}
  /test path/to/suite.yml   run the named configuration
  /test auto                print the detected test commands to declare`;
/**
* Register the `/test` command.
* @param ctx - context carrying the command registry.
*/
function apply(ctx) {
	ctx.effect(() => ctx.commands.register({
		name: "test",
		description: "Run a declared test suite and write a Test Observatory HTML report",
		input: { hint: "config file path, or \"auto\"" },
		handler: (invocation) => execute(invocation)
	}), "command-test lifecycle");
}
/**
* Execute one `/test` invocation.
* @param invocation - the parsed invocation.
* @returns the human-facing outcome.
*/
async function execute(invocation) {
	const argument = invocation.rawInput.trim();
	if (argument === "auto") {
		const directory = invocation.agent.session.header.cwd ?? process.cwd();
		return {
			kind: "success",
			text: describeDetection(await detectProject(directory), directory)
		};
	}
	const workspace = invocation.agent.session.header.cwd ?? process.cwd();
	const configPath = resolve(workspace, argument.length === 0 ? DEFAULT_CONFIG : argument);
	let config;
	try {
		config = await loadSuiteConfig(configPath);
	} catch (error) {
		if (error instanceof SuiteConfigError) return {
			kind: "error",
			text: `${error.message}\n\n${USAGE}`
		};
		throw error;
	}
	const outcomes = [];
	for (const testCase of config.cases) outcomes.push(await runCase(testCase, invocation.signal, workspace));
	const outputPath = resolve(workspace, config.report?.outputPath ?? "test-observatory-report.html");
	const experienceSection = config.journeys === void 0 ? void 0 : toExperienceSection(await runExperience({
		journeys: config.journeys,
		signal: invocation.signal
	}));
	const structuredTests = [];
	const snapshotCounts = [];
	for (const outcome of outcomes) {
		if (outcome.testCase.result === void 0) continue;
		try {
			const read = await readStructuredResult(outcome.testCase.result, outcome.testCase, workspace);
			structuredTests.push(...read.tests);
			if (read.snapshots !== void 0) snapshotCounts.push(read.snapshots);
		} catch (error) {
			return {
				kind: "error",
				text: `could not read structured result for ${outcome.testCase.name}: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	const snapshotSentence = snapshotCounts.length === 0 ? void 0 : describeSnapshots(snapshotCounts.reduce((total, counts) => ({
		matched: total.matched + counts.matched,
		added: total.added + counts.added,
		unmatched: total.unmatched + counts.unmatched,
		updated: total.updated + counts.updated,
		unchecked: total.unchecked + counts.unchecked,
		total: Math.max(total.total, counts.total)
	}), {
		matched: 0,
		added: 0,
		unmatched: 0,
		updated: 0,
		unchecked: 0,
		total: 0
	}));
	let model = buildReportModel(outcomes, {
		config,
		runAt: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC",
		runId: String(Date.now()).slice(-6),
		branch: "",
		commit: "",
		environment: "local",
		...experienceSection === void 0 ? {} : { experienceSection },
		...structuredTests.length === 0 ? {} : { structuredTests },
		...snapshotSentence === void 0 ? {} : { snapshots: snapshotSentence }
	});
	const historyPath = config.report?.historyPath;
	if (historyPath !== false) try {
		const projection = await projectHistory(resolve(workspace, historyPath ?? ".test-observatory/history.json"), model);
		const historyCounts = {
			passed: projection.tests.filter((test) => test.status === "passed").length,
			failed: projection.tests.filter((test) => test.status === "failed").length,
			skipped: projection.tests.filter((test) => test.status === "skipped").length,
			flaky: projection.tests.filter((test) => test.status === "flaky").length
		};
		const retried = projection.tests.filter((test) => (test.attempts ?? 1) > 1).length;
		const passRate = model.summary.total === 0 ? 0 : Math.round(historyCounts.passed / model.summary.total * 1e3) / 10;
		const hasRisk = historyCounts.failed > 0 || historyCounts.flaky > 0 || retried > 0;
		model = {
			...model,
			trend: projection.trend,
			regressions: projection.regressions,
			recovered: projection.recovered,
			tests: projection.tests,
			causes: historyCounts.failed === 0 ? [] : [{
				label: "Failed structured test",
				count: historyCounts.failed
			}],
			slowest: [...projection.tests].sort((left, right) => right.durationSeconds - left.durationSeconds).slice(0, 10).map((test, index) => ({
				rank: index + 1,
				name: test.name,
				suite: test.suite,
				durationSeconds: test.durationSeconds
			})),
			summary: {
				...model.summary,
				...historyCounts
			},
			verdict: (() => {
				const experienceScore = experienceSection?.experience.total;
				const testScore = Math.round(passRate);
				const combinedScore = experienceScore === void 0 ? testScore : Math.min(testScore, experienceScore);
				const experienceRisk = experienceScore !== void 0 && experienceScore < 100;
				const headline = historyCounts.failed > 0 ? historyCounts.failed + " tests failed." : retried > 0 ? retried + " test(s) passed only after a retry." : experienceRisk ? "Automated tests passed; experience checks scored " + experienceScore + "/100." : "Every test passed.";
				const needsReview = hasRisk || experienceRisk;
				return {
					...model.verdict,
					score: combinedScore,
					headline,
					label: needsReview ? "Suite needs review" : "Suite passing",
					summary: historyCounts.failed > 0 ? "Review the failing tests before release." : retried > 0 ? "At least one test needed more than one attempt; treat its result as provisional." : experienceRisk ? "The test suite passed, but browser observations found release risks." : "The test suite completed without failures.",
					confidence: passRate + "% stable pass rate" + (experienceScore === void 0 ? "" : " · " + experienceScore + "/100 experience score"),
					risk: historyCounts.failed > 0 ? "Historical comparison found tests that passed in the previous run and fail now." : retried > 0 ? "Historical comparison found tests that needed a retry, which a single run cannot distinguish from flakiness." : experienceRisk ? "Experience checks scored " + experienceScore + "/100; inspect browser findings before release." : "No failing test in this run."
				};
			})(),
			kpis: [
				{
					label: "Pass rate",
					value: passRate + "%",
					delta: historyCounts.passed + " of " + model.summary.total,
					...hasRisk ? { worse: true } : {}
				},
				{
					label: "Total tests",
					value: String(model.summary.total),
					delta: model.summary.total + " observed"
				},
				model.kpis[2],
				{
					label: "Needs review",
					value: String(historyCounts.failed + retried),
					delta: historyCounts.failed > 0 ? historyCounts.failed + " failed" : retried > 0 ? retried + " retried" : "none",
					...hasRisk ? { worse: true } : {}
				}
			]
		};
	} catch (error) {
		return {
			kind: "error",
			text: `test history could not be updated: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const document = renderReport(model);
	try {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, document, "utf8");
	} catch (error) {
		return {
			kind: "error",
			text: `report could not be written to ${outputPath}: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const failedTests = model.tests.filter((test) => test.status === "failed");
	const retriedCount = model.tests.filter((test) => (test.attempts ?? 1) > 1).length;
	const unstable = retriedCount === 0 ? "" : ` ${retriedCount} passed only on retry.`;
	const headline = `${model.summary.passed}/${model.summary.total} passed.${unstable} Report: ${outputPath}`;
	return failedTests.length === 0 ? {
		kind: "success",
		text: headline
	} : {
		kind: "success",
		text: `${headline}\nFailed: ${failedTests.map((test) => test.name).join(", ")}`
	};
}
//#endregion
export { name as i, command_exports as n, inject as r, apply as t };
