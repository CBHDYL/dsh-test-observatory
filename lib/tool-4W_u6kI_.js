import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { n as renderReport$1 } from "./render-Di7fX9zC.js";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { TOOL_ABORTED, defineTool } from "@deepseek-ai/dsh-tools";
import { HarnessError } from "@deepseek-ai/dsh-llm";
//#region lib/types/tool/report.js
/** Adapt model-facing command outcomes to the shared Test Observatory report. */
/**
* Render model-facing command results with the same standalone Observatory UI as /test.
* @param title - report and project title.
* @param summary - aggregate command counts.
* @param results - command outcomes in execution order.
* @returns one self-contained HTML document.
*/
function renderReport(title, summary, results) {
	const durationSeconds = Math.round(summary.durationMs / 10) / 100;
	const passRate = summary.total === 0 ? 0 : Math.round(summary.passed / summary.total * 1e3) / 10;
	let elapsed = 0;
	const model = {
		meta: {
			project: title,
			branch: "",
			commit: "",
			environment: "tool",
			runAt: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC",
			runId: String(Date.now()).slice(-6)
		},
		verdict: {
			score: Math.round(passRate),
			headline: summary.failed === 0 ? "Every test passed." : summary.failed + " tests failed.",
			label: summary.failed === 0 ? "Suite passing" : "Suite failing",
			summary: summary.failed === 0 ? "The command suite completed without failures." : "Inspect failed command evidence before release.",
			confidence: passRate + "% pass rate",
			risk: summary.failed === 0 ? "No failing command in this run." : "Captured output is available in test details."
		},
		kpis: [
			{
				label: "Pass rate",
				value: passRate + "%",
				delta: summary.passed + " of " + summary.total,
				...summary.failed ? { worse: true } : {}
			},
			{
				label: "Total tests",
				value: String(summary.total),
				delta: summary.total + " observed"
			},
			{
				label: "Duration",
				value: durationSeconds.toFixed(1) + "s",
				delta: "wall clock"
			},
			{
				label: "Failed",
				value: String(summary.failed),
				delta: summary.failed ? "needs review" : "none",
				...summary.failed ? { worse: true } : {}
			}
		],
		summary: {
			total: summary.total,
			passed: summary.passed,
			failed: summary.failed,
			skipped: 0,
			flaky: 0,
			durationSeconds,
			coveragePercent: null
		},
		trend: [],
		causes: summary.failed ? [{
			label: "Non-zero exit",
			count: summary.failed
		}] : [],
		slowest: [...results].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10).map((result, index) => ({
			rank: index + 1,
			name: result.name,
			suite: "Command",
			durationSeconds: result.durationMs / 1e3
		})),
		timeline: results.map((result) => {
			const duration = result.durationMs / 1e3, current = {
				label: result.name,
				startSeconds: elapsed,
				durationSeconds: duration
			};
			elapsed += duration;
			return current;
		}),
		regressions: [],
		recovered: [],
		tests: results.map((result) => ({
			name: result.name,
			path: result.command,
			status: result.passed ? "passed" : "failed",
			suite: "Command",
			durationSeconds: result.durationMs / 1e3,
			owner: "Unassigned",
			stdout: result.stdout,
			stderr: result.stderr,
			...result.passed ? {} : { error: "Exit " + String(result.exitCode) + "; expected " + result.expectedExitCode }
		}))
	};
	return renderReport$1(model);
}
//#endregion
//#region lib/types/tool/index.js
/**
* Model-facing generic test executor: runs a list of shell-command test
* cases sequentially and writes a self-contained HTML report to disk. Each
* test case's own exit code encodes pass/fail — this tool provides no
* built-in assertion library. Self-contained: subprocess execution goes
* directly through node:child_process rather than a shell capability seam,
* mirroring how dsh-tool-fs uses node:fs directly.
* @module @deepseek-ai/dsh-tool-test-runner
*/
var tool_exports = /* @__PURE__ */ __exportAll({
	apply: () => apply,
	inject: () => inject,
	name: () => name
});
const name = "tool-test-runner";
const inject = ["tools"];
/** Bound on captured stdout/stderr kept in the canonical value and the report. */
const OUTPUT_TRUNCATION_LIMIT = 2e4;
/** Marker appended when captured output exceeds {@link OUTPUT_TRUNCATION_LIMIT}. */
const TRUNCATION_MARKER = "\n... [truncated]";
/**
* Truncate captured output to a bounded size, appending a marker when the
* original text exceeded the limit.
* @param text - raw captured stdout or stderr.
* @returns the text unchanged, or its head plus {@link TRUNCATION_MARKER}.
*/
function truncateOutput(text) {
	if (text.length <= OUTPUT_TRUNCATION_LIMIT) return text;
	return text.slice(0, OUTPUT_TRUNCATION_LIMIT) + TRUNCATION_MARKER;
}
/**
* Validate one test case's value constraints the ParameterSchemaSpec cannot
* express: non-empty name/command, and a positive timeout when supplied.
* @param testCase - one model-supplied test case, already schema-checked.
* @throws when a constraint is violated.
*/
function validateTestCase(testCase) {
	if (testCase.name.trim().length === 0) throw new Error("invalid test case: `name` must be a non-empty string");
	if (testCase.command.trim().length === 0) throw new Error(`invalid test case ${JSON.stringify(testCase.name)}: \`command\` must be a non-empty string`);
	if (testCase.timeoutMs !== void 0 && (!Number.isFinite(testCase.timeoutMs) || testCase.timeoutMs <= 0)) throw new Error(`invalid test case ${JSON.stringify(testCase.name)}: \`timeoutMs\` must be a positive number`);
}
/**
* Run one test case's command via `bash -c` and capture its outcome. Honors
* `signal`: an abort during execution kills the in-flight subprocess and
* rejects with an `AbortError`, propagated to the caller as an infra
* cancellation rather than recorded as a test result. A non-zero exit, a
* timeout, or a kill-by-signal all resolve normally (they are ordinary test
* outcomes) — only a genuine spawn failure (`ENOENT` and similar) also
* resolves normally, recorded as a non-matching exit code, because the model
* needs to see "this command could not run" as a failed test case, not as a
* tool-call infrastructure error.
* @param testCase - the test case to execute, already validated.
* @param signal - caller-owned cancellation; an abort kills the subprocess.
* @returns the executed test case's complete result.
*/
function runTestCase(testCase, signal) {
	const expectedExitCode = testCase.expectedExitCode ?? 0;
	const start = performance.now();
	return new Promise((resolve, reject) => {
		execFile("bash", ["-c", testCase.command], {
			encoding: "utf8",
			signal,
			maxBuffer: 67108864,
			...testCase.timeoutMs !== void 0 ? { timeout: testCase.timeoutMs } : {}
		}, (error, stdout, stderr) => {
			const durationMs = Math.round(performance.now() - start);
			if (error !== null && error.name === "AbortError") {
				reject(error);
				return;
			}
			const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : null;
			resolve({
				name: testCase.name,
				command: testCase.command,
				exitCode,
				expectedExitCode,
				passed: exitCode === expectedExitCode,
				durationMs,
				stdout: truncateOutput(stdout),
				stderr: truncateOutput(stderr)
			});
		});
	});
}
/**
* Register the `run_tests` tool on `ctx.tools`.
* @param ctx - registrant context carrying the tool registry.
*/
function apply(ctx) {
	ctx.tools.register(defineTool({
		name: "run_tests",
		description: "Execute a list of shell-command test cases sequentially and write a detailed, self-contained HTML test report to disk. Each test case is a shell command whose own exit code encodes pass/fail — this tool provides no built-in assertion library, so supply commands that fail (non-zero exit, or the declared expectedExitCode) exactly when the tested behavior is wrong. Returns the report file path plus a structured summary and per-test results.",
		parameters: {
			testCases: {
				type: "array",
				required: true,
				description: "The test cases to execute, in order. At least one is expected, though an empty list is accepted.",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						name: {
							type: "string",
							required: true,
							description: "Test case name/description, shown in the report."
						},
						command: {
							type: "string",
							required: true,
							description: "Shell command to execute via `bash -c`."
						},
						expectedExitCode: {
							type: "integer",
							description: "Exit code this test case must produce to pass. Defaults to 0 (the ordinary success code) when omitted."
						},
						timeoutMs: {
							type: "integer",
							description: "Per-test-case timeout in milliseconds. No timeout is applied when omitted."
						}
					}
				}
			},
			reportPath: {
				type: "string",
				required: true,
				description: "Absolute path where the HTML report file should be written."
			},
			title: {
				type: "string",
				description: "Report title. Defaults to \"Test Report\" when omitted."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					reportPath: {
						type: "string",
						required: true
					},
					summary: {
						type: "object",
						additionalProperties: false,
						required: true,
						properties: {
							total: {
								type: "integer",
								required: true
							},
							passed: {
								type: "integer",
								required: true
							},
							failed: {
								type: "integer",
								required: true
							},
							durationMs: {
								type: "number",
								required: true
							}
						}
					},
					results: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: {
									type: "string",
									required: true
								},
								command: {
									type: "string",
									required: true
								},
								exitCode: {
									required: true,
									oneOf: [{ type: "integer" }, { type: "null" }]
								},
								expectedExitCode: {
									type: "integer",
									required: true
								},
								passed: {
									type: "boolean",
									required: true
								},
								durationMs: {
									type: "number",
									required: true
								},
								stdout: {
									type: "string",
									required: true
								},
								stderr: {
									type: "string",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Ran ${value.summary.total} tests: ${value.summary.passed} passed, ${value.summary.failed} failed. Report written to ${value.reportPath}.`
			}]
		},
		async execute(args, exec) {
			for (const testCase of args.testCases) validateTestCase(testCase);
			const title = args.title ?? "Test Report";
			const results = [];
			for (const testCase of args.testCases) try {
				results.push(await runTestCase(testCase, exec.signal));
			} catch {
				const abortError = new HarnessError("tool call aborted", TOOL_ABORTED);
				abortError.name = "AbortError";
				throw abortError;
			}
			const summary = {
				total: results.length,
				passed: results.filter((result) => result.passed).length,
				failed: results.filter((result) => !result.passed).length,
				durationMs: results.reduce((sum, result) => sum + result.durationMs, 0)
			};
			const html = renderReport(title, summary, results);
			try {
				await writeFile(args.reportPath, html, "utf8");
			} catch (error) {
				throw new Error(`run_tests: failed to write report to ${args.reportPath}: ${error.message}`);
			}
			return {
				reportPath: args.reportPath,
				summary,
				results
			};
		},
		presentCall: (args) => ({
			card: "generic",
			title: "Run tests",
			kind: "other",
			rawInput: {
				testCases: args.testCases.map((testCase) => testCase.name),
				reportPath: args.reportPath
			}
		})
	}));
}
//#endregion
export { tool_exports as i, inject as n, name as r, apply as t };
