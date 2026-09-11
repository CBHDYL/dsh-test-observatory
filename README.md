# @cbhdyl/dsh-test-observatory

English | [中文](README.zh.md)

## Summary

Installing this layer into a profile gives that profile two entry points: `/test`, where a person runs a declared test suite and drives real browser journeys, and `run_tests`, where the agent runs shell-command cases itself. Both write the same self-contained HTML report — a management summary over an engineering drill-down — that opens from disk with no server and no external assets. The report carries a rule-based experience score over six weighted dimensions, persona journey rails with annotated screenshots, deterministic visual checks, and an axe-core accessibility scan. Journeys need a Chromium; the layer uses `playwright-core`, which does not download one.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

A profile gains both entry points by installing this layer, and loses them again by removing it.

### Install into a profile

```text
dsh plugin --profile web add @cbhdyl/dsh-test-observatory
dsh plugin --profile web remove @cbhdyl/dsh-test-observatory
```

Restart `dsh web`, then type `/test` in a session. The reconcile step activates the layer because `package.json` declares `dsh.bundle.patch`; without that declaration the same command installs the dependency and mounts nothing.

### What you get

The patch inserts two rows, each owned by this package:

| Row id | Entry | Surface |
|---|---|---|
| `tool-test-runner` | `@cbhdyl/dsh-test-observatory/tool` | the model-facing `run_tests` tool |
| `command-test` | `@cbhdyl/dsh-test-observatory/command` | the human `/test` command |

They share one report renderer and one experience runner:

- executive quality score, verdict and risk summary
- pass rate, duration, coverage and failure counts
- quality trajectory, failure causes, slowest tests, runtime timeline
- new regressions and recovered tests
- rule-based experience score across six weighted dimensions
- persona cards, journey rails with per-step timings, screenshot gallery
- deterministic visual checks (broken images, missing alt, overflow, placeholder-only fields)
- an axe-core accessibility scan with each violation listed
- UX findings separating browser fact from AI interpretation

The experience score weights completion at 30, usability at 20, visual quality at 15, feedback and recovery at 15, accessibility at 10, and perceived performance at 10. Violations are deduplicated by rule and observation, so one page defect seen by three personas costs once.

### Configure the suite

Create `test-observatory.yml` in the session working directory:

```yaml
report:
  title: Release candidate
  project: Atlas Shop
  outputPath: reports/test-observatory.html
  historyPath: .test-observatory/history.json
cases:
  - name: Unit tests
    command: pnpm run test
    suite: Unit
    owner: Platform
    timeoutMs: 600000
    result:
      format: vitest
      path: reports/vitest.json
  - name: Typecheck
    command: pnpm run typecheck
journeys:
  - persona: First-time visitor
    device: Desktop · Chrome
    name: First-time checkout
    viewport: { width: 1440, height: 900 }
    steps:
      - label: Open storefront
        actions:
          - kind: goto
            url: http://127.0.0.1:3000/
          - kind: expectText
            text: Complete your order
          - kind: screenshot
            caption: Checkout discovered
            category: key
      - label: Submit payment
        actions:
          - kind: fill
            selector: '#email'
            value: buyer@example.com
          - kind: click
            selector: '#submit'
          - kind: expectVisible
            selector: '#done'
```

The commands a person types:

```text
/test                     run ./test-observatory.yml
/test path/to/suite.yml   run the named configuration
/test auto                detect the project and print a declaration to paste
```

#### Structured results

A case expands into real test-level rows when its command writes an artifact. Set `result.format` to `junit`, `pytest`, `vitest`, `jest`, `playwright`, `api`, `performance` or `sarif`, and set `result.path` relative to the session working directory. History is retained for 20 runs by default; set `report.historyPath: false` to disable it.

Playwright rows retain retry count and screenshot/video/trace paths. API rows retain method, URL, expected and actual status, and duration. Performance rows retain thresholds, P50/P95/P99 and throughput when the artifact provides them.

#### Journey behaviour

Each journey takes an optional `behavior:` preset — `neutral`, `first-time`, `expert`, `keyboard`, `error-prone`, `mobile` or `impatient` — which sets input, timing, modality, environment and recovery policy together. Any dimension of a preset is overridable with the object form.

### Provide a browser

Journeys need a Chromium. The layer uses `playwright-core`, which does not download a browser; set `DSH_BROWSER_EXECUTABLE` when none is found:

```sh
export DSH_BROWSER_EXECUTABLE=/path/to/chrome
```

Without a browser the journey pass fails loudly instead of reporting a false pass.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`cordis.patch.yml` is the whole layer: two `insert` rows targeted by id, so a profile can override or disable either one and the plugin code resolves through this single installed package. Configuration loading, case execution and the report writer live in `src/command/`; structured-result parsers for JUnit, Vitest, Jest, Playwright, Pytest, API, performance and SARIF artifacts live beside them and never infer a pass from a missing artifact. The browser run in `src/experience/` drives one Chromium sequentially, applies each journey's behaviour preset, captures masked and annotated evidence, checks keyboard reachability, and scores the observations by rule. `src/report/` owns the document: one HTML string with inline CSS and a generated asset bundle.

| Path | Owns |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | the two inserted rows |
| [`src/command/`](src/command/) | suite configuration, execution, structured results, history |
| [`src/experience/`](src/experience/) | journeys, behaviour presets, capture, annotation, checks, scoring |
| [`src/report/`](src/report/) | the standalone HTML document and its assets |
| [`src/tool/`](src/tool/) | the `run_tests` tool and its report adaptation |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Test Runner subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/test-runner.md) — the test-case and run-summary types, execution model, and report contract.
- [Generated tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md#cbhdyldsh-test-observatory) — the `run_tests` schema the model receives.
- [test-runner group](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/test-runner/README.md) — where this package sits.
- [USAGE.zh.md](USAGE.zh.md) — a walkthrough for writing a suite file against a real project.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`run_tests` schema](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md#cbhdyldsh-test-observatory). Optional `expectedExitCode` and `timeoutMs`, the acceptance of an empty `testCases` array, and the absolute-path requirement on `reportPath` are stated in the schema itself.

#### Token effect

Fixed per request while the plugin stays loaded. Registering `run_tests` is the only way this package adds model context; it adds no system-prompt section.

#### KV Cache effect

Prefix-stable while the schema and its position among registered tools are unchanged. Loading or unloading the plugin, or a tool-scope restriction that hides `run_tests`, may invalidate reuse from the first changed schema token.

### Tool result

#### What the model sees

One text block. A run with no failures renders exactly one line: `Ran <total> tests: <passed> passed, <failed> failed. Report written to <reportPath>.` Each of the first five failing cases adds a blank line, `Test case "<name>" exited <code>, expected <expected>.`, `Command: <command>`, and — when the case captured output — the tail of its combined stdout and stderr; a case with no observed exit code reads `did not exit normally` instead. A run with more than five failing cases ends with `<count> further failing case(s) are in the report.` The validated output value carries every case's `stdout` and `stderr`, and reaches the model only through this evidence paragraph.

#### Token effect

One line plus at most five evidence paragraphs per call, independent of case count. Each evidence paragraph keeps at most the last 1,000 characters of its case's output, and captured `stdout` and `stderr` are each truncated to 20,000 characters with a trailing marker before the value is built.

#### KV Cache effect

Append-only; a result extends the request after the reused prefix and does not invalidate earlier cached tokens.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits tell you when the observatory is incomplete or needs deployment cooperation. They are current package constraints, not a task backlog.

- **Visual quality covers five objective rules, not aesthetics** — spacing, alignment and hierarchy are not measured, so a clean score is not a claim about design quality.
- **Journeys run sequentially in one browser** — a journey waits for its predecessor, with optional per-step retries; there is no parallel fan-out.
- **Screenshots are embedded as data URIs** — a capture over 400 KB is re-encoded and finally dropped if still too large, and a dropped capture is reported as a capture defect rather than silently omitted.
- **History keeps the latest 20 compact run snapshots** in `.test-observatory/history.json`; delete the file to reset comparisons.
- **Structured results report exactly the rows their artifact contains** — a deselected or skipped case the artifact omits cannot appear, and no supported format supplies a known-total denominator.
- **`/test auto` prints a starter declaration from project and script detection** — it infers neither `result.format` artifacts nor journeys.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
