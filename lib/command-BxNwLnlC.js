import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { r as renderReport } from "./report-NalDAucQ.js";
import { a as scoreRun, d as runExperience } from "./experience-BhFBpVDz.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { execFile } from "node:child_process";
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
* Read an optional positive integer field.
* @param record - the mapping holding the field.
* @param key - the field name.
* @param where - the position description used in the error.
* @returns the value, or undefined when absent.
*/
function optionalPositiveInt(record, key, where) {
	const value = record[key];
	if (value === void 0) return void 0;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new SuiteConfigError(`${where}: "${key}" must be a non-negative integer`);
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
	const expectedExitCode = optionalPositiveInt(record, "expectedExitCode", where);
	const timeoutMs = optionalPositiveInt(record, "timeoutMs", where);
	const suite = record["suite"];
	const owner = record["owner"];
	if (suite !== void 0 && typeof suite !== "string") throw new SuiteConfigError(`${where}: "suite" must be a string`);
	if (owner !== void 0 && typeof owner !== "string") throw new SuiteConfigError(`${where}: "owner" must be a string`);
	return {
		name,
		command,
		...expectedExitCode === void 0 ? {} : { expectedExitCode },
		...timeoutMs === void 0 ? {} : { timeoutMs },
		...suite === void 0 ? {} : { suite },
		...owner === void 0 ? {} : { owner }
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
	return options;
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
		case "screenshot": {
			const category = record["category"];
			if (category !== "key" && category !== "fail" && category !== "mobile" && category !== "final") throw new SuiteConfigError(`${where}: "category" must be key, fail, mobile or final`);
			return {
				kind: "screenshot",
				caption: requireString(record, "caption", where),
				category
			};
		}
		default: throw new SuiteConfigError(`${where}: "kind" must be goto, click, fill, expectText, expectVisible or screenshot`);
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
//#region lib/types/command/runner.js
/**
* Suite execution: run every declared case, then build the report model the
* renderer consumes. The command shell is the only external dependency, so the
* model construction is a pure function of the settled case outcomes.
* @module @deepseek-ai/dsh-command-test/runner
*/
/** Bound on captured output per stream, so one noisy case cannot bloat the report. */
const MAX_CAPTURED_CHARS = 2e4;
/**
* Truncate captured output with a visible marker.
* @param value - the captured text.
* @returns the text, truncated when it exceeds the bound.
*/
function truncate(value) {
	if (value.length <= 2e4) return value;
	return value.slice(0, MAX_CAPTURED_CHARS) + "\n… [truncated]";
}
/**
* Run one declared case and settle it into an outcome. A non-zero exit, a
* timeout, or a spawn failure are ordinary outcomes, not exceptions: only a
* caller cancellation rejects.
* @param testCase - the case to run.
* @param signal - the invocation's cancellation signal.
* @param cwd - directory the command runs in; the session's working directory,
*   so a declared relative command such as `pnpm test` means the project the
*   suite was written for rather than wherever the host process happens to be.
* @returns the settled outcome.
*/
function runCase(testCase, signal, cwd) {
	const expected = testCase.expectedExitCode ?? 0;
	const started = Date.now();
	return new Promise((resolve, reject) => {
		execFile("bash", ["-c", testCase.command], {
			timeout: testCase.timeoutMs,
			maxBuffer: 8 * 1024 * 1024,
			signal,
			...cwd === void 0 ? {} : { cwd }
		}, (error, stdout, stderr) => {
			const durationMs = Date.now() - started;
			if (signal.aborted) {
				reject(error);
				return;
			}
			const code = error?.code;
			const exitCode = typeof code === "number" ? code : error === null ? 0 : null;
			resolve({
				testCase,
				exitCode,
				passed: exitCode === expected,
				durationMs,
				stdout: truncate(stdout),
				stderr: truncate(stderr)
			});
		});
	});
}
/**
* Map one outcome to the report status vocabulary.
* @param outcome - the settled outcome.
* @returns the report status.
*/
function toStatus(outcome) {
	return outcome.passed ? "passed" : "failed";
}
/**
* Build the report table row for one outcome.
* @param outcome - the settled outcome.
* @returns the report row.
*/
function toReportTest(outcome) {
	return {
		name: outcome.testCase.name,
		path: outcome.testCase.command,
		status: toStatus(outcome),
		suite: outcome.testCase.suite ?? "Suite",
		durationSeconds: Math.round(outcome.durationMs / 10) / 100,
		owner: outcome.testCase.owner ?? "Unassigned",
		...outcome.stdout.length === 0 ? {} : { stdout: outcome.stdout },
		...outcome.stderr.length === 0 ? {} : { stderr: outcome.stderr }
	};
}
/**
* Format a duration in seconds as a compact human string.
* @param seconds - the duration in seconds.
* @returns the formatted duration.
*/
function formatDuration(seconds) {
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}
/**
* Build the report model from settled outcomes.
* @param outcomes - every settled case outcome, in declaration order.
* @param inputs - run identity the caller knows.
* @returns the renderable report model.
*/
function buildReportModel(outcomes, inputs) {
	const total = outcomes.length;
	const passed = outcomes.filter((outcome) => outcome.passed).length;
	const failed = total - passed;
	const durationSeconds = Math.round(outcomes.reduce((sum, outcome) => sum + outcome.durationMs, 0) / 10) / 100;
	const passRate = total === 0 ? 0 : Math.round(passed / total * 1e3) / 10;
	const project = inputs.config.report?.project ?? "Test suite";
	const score = Math.round(passRate);
	const model = {
		meta: {
			project,
			branch: inputs.branch,
			commit: inputs.commit,
			environment: inputs.environment,
			runAt: inputs.runAt,
			runId: inputs.runId
		},
		verdict: {
			score,
			headline: failed === 0 ? "Every declared test passed." : `${failed} of ${total} tests failed.`,
			label: failed === 0 ? "Suite passing" : "Suite failing",
			summary: failed === 0 ? "The declared command suite completed without failures." : "At least one declared command did not produce its expected exit code.",
			confidence: `${passRate}% pass rate`,
			risk: failed === 0 ? "No failing command in this run." : "Failing commands are reported with their captured output; inspect the details table before release."
		},
		kpis: [
			{
				label: "Pass rate",
				value: `${passRate}%`,
				delta: `${passed} of ${total}`,
				...failed > 0 ? { worse: true } : {}
			},
			{
				label: "Total tests",
				value: String(total),
				delta: `${total} declared`
			},
			{
				label: "Duration",
				value: formatDuration(durationSeconds),
				delta: "wall clock"
			},
			{
				label: "Failed",
				value: String(failed),
				delta: failed === 0 ? "none" : "needs review",
				...failed > 0 ? { worse: true } : {}
			}
		],
		summary: {
			total,
			passed,
			failed,
			skipped: 0,
			flaky: 0,
			durationSeconds,
			coveragePercent: null
		},
		trend: [{
			run: inputs.runId,
			score,
			durationSeconds
		}],
		causes: failed === 0 ? [] : [{
			label: "Non-zero exit",
			count: failed
		}],
		slowest: [...outcomes].sort((left, right) => right.durationMs - left.durationMs).slice(0, 10).map((outcome, index) => ({
			rank: index + 1,
			name: outcome.testCase.name,
			suite: outcome.testCase.suite ?? "Suite",
			durationSeconds: Math.round(outcome.durationMs / 10) / 100
		})),
		timeline: outcomes.map((outcome) => ({
			label: outcome.testCase.name,
			startSeconds: 0,
			durationSeconds: Math.max(Math.round(outcome.durationMs / 10) / 100, .1)
		})),
		regressions: [],
		recovered: [],
		tests: outcomes.map(toReportTest)
	};
	if (inputs.experienceSection !== void 0) return {
		...model,
		...inputs.experienceSection
	};
	return model;
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
		recoverablePoints: 2
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
		headline: journey.passed ? "Completed" : "Blocked"
	}));
	const journeys = run.journeys.map((journey) => ({
		personaId: personaId(journey.persona),
		name: journey.name,
		steps: journey.steps.map((step) => ({
			label: step.label,
			state: step.state,
			seconds: step.state === "BLOCKED" ? null : Math.round(step.durationMs / 10) / 100
		}))
	}));
	const evidence = run.shots.map((shot) => ({
		title: shot.caption,
		personaId: personaId(shot.persona),
		kind: shot.category,
		meta: shot.meta,
		imageDataUri: shot.dataUri
	}));
	const findings = run.journeys.flatMap((journey, journeyIndex) => journey.steps.filter((step) => step.state === "FAIL").map((step, stepIndex) => toFinding(journey, step.label, step.error ?? "step did not settle", journeyIndex * 100 + stepIndex)));
	const seen = /* @__PURE__ */ new Set();
	const checks = [];
	for (const entry of run.checks) for (const [family, findings] of [["visual", entry.visual], ["accessibility", entry.accessibility]]) for (const finding of findings) {
		const key = family + "|" + finding.rule + "|" + finding.detail;
		if (seen.has(key)) continue;
		seen.add(key);
		checks.push({
			...finding,
			family,
			persona: entry.persona
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
	const document = renderReport(buildReportModel(outcomes, {
		config,
		runAt: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC",
		runId: String(Date.now()).slice(-6),
		branch: "",
		commit: "",
		environment: "local",
		...experienceSection === void 0 ? {} : { experienceSection }
	}));
	try {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, document, "utf8");
	} catch (error) {
		return {
			kind: "error",
			text: `report could not be written to ${outputPath}: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const failed = outcomes.filter((outcome) => !outcome.passed);
	const headline = `${outcomes.length - failed.length}/${outcomes.length} passed. Report: ${outputPath}`;
	return failed.length === 0 ? {
		kind: "success",
		text: headline
	} : {
		kind: "success",
		text: `${headline}\nFailed: ${failed.map((outcome) => outcome.testCase.name).join(", ")}`
	};
}
//#endregion
export { name as i, command_exports as n, inject as r, apply as t };
