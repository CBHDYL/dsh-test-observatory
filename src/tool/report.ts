/**
 * Pure HTML5 rendering of a test-run report: escaping, the summary section,
 * and the per-test collapsible detail rows. No I/O, no Cordis, no clock/random
 * — this module is unit-tested directly, in isolation from the tool plugin.
 * @module @deepseek-ai/dsh-tool-test-runner/report
 */

/** One executed test case's outcome, as rendered into the report. */
export interface TestCaseResult {
  /** Test case name/description. */
  readonly name: string
  /** The shell command that was run. */
  readonly command: string
  /** Process exit code, or `null` when the process was killed by a signal or aborted before exit. */
  readonly exitCode: number | null
  /** The exit code the test case expected to pass. */
  readonly expectedExitCode: number
  /** Whether `exitCode === expectedExitCode`. */
  readonly passed: boolean
  /** Wall-clock duration of the test case, in milliseconds. */
  readonly durationMs: number
  /** Captured stdout, truncated to a bounded size with a trailing marker. */
  readonly stdout: string
  /** Captured stderr, truncated to a bounded size with a trailing marker. */
  readonly stderr: string
}

/** Aggregate counts and total duration across every executed test case. */
export interface TestRunSummary {
  /** Total number of test cases executed. */
  readonly total: number
  /** Number of test cases whose exit code matched their expectation. */
  readonly passed: number
  /** Number of test cases whose exit code did not match their expectation. */
  readonly failed: number
  /** Sum of every test case's `durationMs`. */
  readonly durationMs: number
}

/**
 * Escape the five HTML-significant characters so interpolated user-controlled
 * strings (names, commands, stdout, stderr, title) cannot inject markup.
 * @param value - raw string that may contain `< > & " '`.
 * @returns the string with each significant character replaced by its entity.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
`

/**
 * Render one test case as a table row with a native `<details>` expansion
 * for its command, stdout, and stderr. Every interpolated string is escaped.
 * @param result - the test case outcome to render.
 * @returns the row's HTML.
 */
function renderRow(result: TestCaseResult): string {
  const badge = result.passed
    ? '<span class="badge pass">PASS</span>'
    : '<span class="badge fail">FAIL</span>'
  const exit = `${result.exitCode ?? 'null'} (expected ${result.expectedExitCode})`
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
    </tr>`
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
export function renderReport(title: string, summary: TestRunSummary, results: readonly TestCaseResult[]): string {
  const rows = results.length > 0
    ? results.map(renderRow).join('\n')
    : '<tr><td colspan="4">No test cases were run.</td></tr>'
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
`
}
