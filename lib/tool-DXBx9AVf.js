import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.js";
import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { TOOL_ABORTED, defineTool } from "@deepseek-ai/dsh-tools";
import { HarnessError } from "@deepseek-ai/dsh-llm";
//#region lib/types/tool/report.js
/**
* Pure HTML5 rendering of a test-run report: escaping, the summary section,
* and the per-test collapsible detail rows. No I/O, no Cordis, no clock/random
* — this module is unit-tested directly, in isolation from the tool plugin.
* @module @deepseek-ai/dsh-tool-test-runner/report
*/
/**
* Escape the five HTML-significant characters so interpolated user-controlled
* strings (names, commands, stdout, stderr, title) cannot inject markup.
* @param value - raw string that may contain `< > & " '`.
* @returns the string with each significant character replaced by its entity.
*/
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Inline, dark-friendly, self-contained stylesheet — no external resources. */
const REPORT_STYLE = `
  :root { color-scheme: dark; }
  body { background: #14161a; color: #e4e6eb; font-family: ui-monospace, 'SF Mono', Consolas, monospace; margin: 2rem; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .summary { display: flex; gap: 1.5rem; margin: 1rem 0 1.5rem; flex-wrap: wrap; }
  .summary .stat { background: #1e2127; border: 1px solid #2c303a; border-radius: 6px; padding: 0.5rem 1rem; }
  .summary .stat .label { display: block; font-size: 0.75rem; color: #9aa0ab; text-transform: uppercase; }
  .summary .stat .value { display: block; font-size: 1.25rem; font-weight: 600; }
  .stat.passed .value { color: #57d38c; }
  .stat.failed .value { color: #ef6b6b; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #2c303a; vertical-align: top; }
  th { color: #9aa0ab; font-size: 0.75rem; text-transform: uppercase; }
  .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge.pass { background: #163d29; color: #57d38c; }
  .badge.fail { background: #421f22; color: #ef6b6b; }
  details { margin-top: 0.4rem; }
  summary { cursor: pointer; color: #9aa0ab; font-size: 0.8rem; }
  pre { background: #0d0f12; border: 1px solid #2c303a; border-radius: 4px; padding: 0.6rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
`;
/**
* Render one test case as a table row with a native `<details>` expansion
* for its command, stdout, and stderr. Every interpolated string is escaped.
* @param result - the test case outcome to render.
* @returns the row's HTML.
*/
function renderRow(result) {
	const badge = result.passed ? "<span class=\"badge pass\">PASS</span>" : "<span class=\"badge fail\">FAIL</span>";
	const exit = `${result.exitCode ?? "null"} (expected ${result.expectedExitCode})`;
	return `
    <tr>
      <td>${escapeHtml(result.name)}</td>
      <td>${badge}</td>
      <td>${escapeHtml(exit)}</td>
      <td>${result.durationMs}ms</td>
    </tr>
    <tr>
      <td colspan="4">
        <details>
          <summary>Details</summary>
          <p><strong>Command:</strong></p>
          <pre>${escapeHtml(result.command)}</pre>
          <p><strong>stdout:</strong></p>
          <pre>${escapeHtml(result.stdout)}</pre>
          <p><strong>stderr:</strong></p>
          <pre>${escapeHtml(result.stderr)}</pre>
        </details>
      </td>
    </tr>`;
}
/**
* Render a complete, self-contained HTML5 test report: a summary section
* (total/passed/failed/duration) followed by one expandable row per test
* case. Every interpolated string (title, names, commands, stdout, stderr) is
* escaped against HTML injection; the stylesheet is inline and no external
* resource is referenced.
* @param title - report title, shown as the page heading.
* @param summary - aggregate counts and total duration.
* @param results - per-test-case outcomes, rendered in execution order.
* @returns a complete HTML document as a string.
*/
function renderReport(title, summary, results) {
	const rows = results.length > 0 ? results.map(renderRow).join("\n") : "<tr><td colspan=\"4\">No test cases were run.</td></tr>";
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${REPORT_STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="summary">
  <div class="stat"><span class="label">Total</span><span class="value">${summary.total}</span></div>
  <div class="stat passed"><span class="label">Passed</span><span class="value">${summary.passed}</span></div>
  <div class="stat failed"><span class="label">Failed</span><span class="value">${summary.failed}</span></div>
  <div class="stat"><span class="label">Duration</span><span class="value">${summary.durationMs}ms</span></div>
</div>
<table>
  <thead><tr><th>Name</th><th>Result</th><th>Exit code</th><th>Duration</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`;
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
			maxBuffer: 64 * 1024 * 1024,
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
