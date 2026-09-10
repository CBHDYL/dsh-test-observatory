# Test Categories Research — What Test Observatory Should Support Next

**Date:** 2026-09-12
**Scope:** Landscape research on test types/categories a single-file HTML test report tool should support.
**Current state:** Test Observatory parses `junit`, `pytest`, `vitest`, `jest`, `playwright`, `api`, `performance`, plus a generic shell-command path (exit code = pass/fail).

## How to read this document

Every factual claim about a format, field name, flag, or percentage carries a URL to the page actually fetched. Claims that could not be confirmed against a primary source are marked **[unverified]** inline. Nothing here invents a format name, field name, or CLI flag; where a name could not be confirmed, that is stated rather than guessed.

**Verification tiers used below:**
- **Verified** — fetched from the official spec, docs, or source repository during this research.
- **[unverified]** — plausible, commonly repeated, but not confirmed from a primary source in this session. Treat as a research gap, not as fact.

---

## Executive summary

Five findings drive the recommendation table:

1. **JUnit XML has no official specification.** The reference project states it plainly: *"There is no official specification for the JUnit XML file format and various tools generate and support different flavors of this format"* ([testmoapp/junitxml](https://github.com/testmoapp/junitxml)). Since Test Observatory already parses it, the cheapest expansion path across Go, Rust, Java, PHP, Swift, Cypress, WebdriverIO, and Selenium is **hardening the existing JUnit parser for dialect variance**, not writing new parsers.

2. **SARIF is the only OASIS-standardized findings format**, and one parser unlocks Ruff, Trivy, Semgrep, Grype, osv-scanner, ESLint (via formatter), and CodeQL. This is the single highest-leverage new parser.

3. **CTRF is not an industry standard.** Verified via the GitHub API this session: `ctrf-io/ctrf` has **93 stars, 4 forks**, is explicitly **pre-1.0** ("to allow for community-driven refinements before locking the v1.0.0 standard"), and every reporter in the ecosystem is published by the same org ([ctrf-io/ctrf](https://github.com/ctrf-io/ctrf)). **Do not adopt it as the internal model** — but do steal its schema design, which solves real problems (`rawStatus`, `retryAttempts[]`) that other formats ignore.

4. **Flakiness cannot be detected from a single run.** This is a definitional constraint, not a tooling gap: every authoritative definition requires observing pass *and* fail **on the same code**. Shipping a "flaky" verdict from one run would be actively harmful.

5. **The most dangerous dishonesty available to this tool is not a missing category — it is a selective run that looks like a full run.** A green report over a test subset is a materially different claim from a green full-suite report, and today's data model cannot express the difference.

---

## 1. Unit/integration test frameworks beyond current support

### Cross-ecosystem summary

| Ecosystem | Native machine-readable | First-class JUnit XML? | Recommended route | Effort |
|---|---|---|---|---|
| Go | `go test -json` NDJSON | via gotestsum `--junitfile` | gotestsum JUnit, or native NDJSON for richer data | S–M |
| Rust | libtest JSON (**nightly only**) | nextest config; nightly `--format junit` | nextest JUnit + flake elements | S |
| Java | Surefire/Gradle XML | it *is* JUnit XML | existing parser + rerun/flaky elements | S |
| .NET | TRX | third-party logger **[unverified]** | parse TRX directly | S |
| Ruby | RSpec `--format json` | third-party gem **[unverified]** | parse RSpec JSON directly | S |
| PHP | PHPUnit `--log-junit` | yes, native | existing junit parser | S (zero) |
| Swift (SwiftPM) | swift-testing JSONL ABI | `swift test --xunit-output` | xUnit XML | S |
| Swift (Xcode) | `.xcresult` via `xcresulttool` | no | macOS-gated `xcresulttool` | M |

### Go — `go test -json`

**What it is.** An *event stream*, not a result document. One test row must be reduced from many events.

**Artifact.** NDJSON on stdout via `go test -json ./...`. Verified `TestEvent` struct ([cmd/test2json](https://pkg.go.dev/cmd/test2json)):

```go
type TestEvent struct {
    Time time.Time; Action string; Package string; Test string
    Elapsed float64 // seconds
    Output string; OutputType string; FailedBuild string
}
```

`Action` ∈ `start | run | pause | cont | pass | bench | fail | output | skip`. `Elapsed` is set only on `pass`/`fail`. Events for the overall package omit `Test`.

**Show it?** **Yes.** One row per `(Package, Test)`, status from the terminal event, plus package-level build-failure rows. Omit `pause`/`cont` and `OutputType=="frame"` decoration.

**Traps.** Parallel tests interleave — key by Package+Test, never arrival order. Subtests arrive as `Parent/Child` and double-count. **A build failure can produce zero test events**, so a naive parser reports "0 tests, all passed" — dangerously wrong. Cached results omit `Time` and report ~0 elapsed (`-count=1` disables caching).

**Effort:** Small–medium. One NDJSON shape, but real event→row normalization.

### Rust — cargo-nextest

**Critical correction:** `cargo test -- --format json` **does not work on stable**. Verified from libtest source: it errors with *"The \"json\" format is only accepted on the nightly compiler with -Z unstable-options"* ([cli.rs](https://raw.githubusercontent.com/rust-lang/rust/master/library/test/src/cli.rs)). Do not document it as if it works.

**The stable path is nextest JUnit, and it is config-driven, not a CLI flag** ([nexte.st JUnit docs](https://nexte.st/docs/machine-readable/junit/)):

```toml
# .config/nextest.toml
[profile.ci.junit]
path = "junit.xml"
```

Then `cargo nextest run --profile ci` → `target/nextest/ci/junit.xml`. Nextest's own docs note it *"adheres to the Jenkins XML format"* and warn that other tools diverge.

**Show it?** Yes, via JUnit — and specifically surface the **retry/flake structure**: a testcase carrying `<rerunFailure>` or `<flakyFailure>` is a flake, not a clean pass. That is the most valuable Rust-specific signal.

**Trap:** `flaky-fail-status = "success"` makes a flaky-failed test appear as a **pass in the XML while the runner still exits non-zero** — a report built only from XML will contradict the exit code.

**Effort:** Small via nextest JUnit. Native libtest JSON is medium and its own docs' "Format specification" section is literally "TODO".

### Java — Surefire / Gradle

The ancestor of everything called "JUnit XML". Surefire writes automatically on `mvn test` to `target/surefire-reports/TEST-*.xml` ([Surefire](https://maven.apache.org/surefire/maven-surefire-plugin/)); Gradle's own docs call it *"the 'JUnit XML' pseudo standard"*.

**Verified from the actual XSD** (v3.0.2): **the root is a single `<testsuite>`, not `<testsuites>`**; children include `<failure>`, `<error>`, `<skipped>`, plus the rerun family `<rerunFailure>`, `<rerunError>`, `<flakyFailure>`, `<flakyError>` ([surefire-test-report.xsd](https://raw.githubusercontent.com/apache/maven-surefire/master/maven-surefire-plugin/src/site/resources/xsd/surefire-test-report.xsd)).

**Traps.** Root element differs from nextest's — dialect detection must not assume `<testsuites>`. Counts are declared `xs:string`, not integers. Both Maven and Gradle emit **one file per test class**, so glob-and-merge is mandatory. Rerun-passed tests still emit `<flakyFailure>` content, so counting failure-like elements overstates failures.

**Effort:** Small — extend the existing parser.

### .NET — TRX

XML, `.trx`, namespace `http://microsoft.com/schemas/VisualStudio/TeamTest/2010`, from `dotnet test --logger trx`. Key paths: `TestRun.Results.UnitTestResult` with `testName`, `duration`, `outcome`, `Output.ErrorInfo.Message`; `TestRun.ResultSummary.Counters` ([vstest trx-analysis](https://raw.githubusercontent.com/microsoft/vstest/main/.github/skills/trx-analysis/SKILL.md)).

**Trap that will bite immediately:** `duration` is formatted `HH:mm:ss.fffffff`, **not a float** — `parseFloat("00:00:01.234")` yields `0`. Also, the XML namespace is mandatory, and multi-targeted projects **overwrite each other** with a fixed `logfilename` (use `LogFilePrefix`).

Complete `outcome` enum is **[unverified]**; `--logger trx` semantics under .NET 10's Microsoft.Testing.Platform are **[unverified]**.

**Effort:** Small.

### Ruby — RSpec JSON

Single JSON document (not NDJSON) via `rspec --format json --out results.json`. Verified top-level keys: `version`, `messages`, `examples`, `summary`, `summary_line`, `seed`, `profile`; each example has `id`, `description`, `full_description`, `status`, `file_path`, `line_number`, `run_time`, `pending_message`, plus `exception{class, message, backtrace}` ([json_formatter.rb](https://raw.githubusercontent.com/rspec/rspec-core/main/lib/rspec/core/formatters/json_formatter.rb), [RSpec feature docs](https://rspec.info/features/3-13/rspec-core/formatters/json-formatter/)).

**Traps.** The document is written entirely at `close`, so a killed run leaves **truncated, unparseable JSON** — always keep the exit-code fallback. `errors_outside_of_examples_count` counts failures with **no corresponding `examples` entry** (e.g. a `before(:suite)` blowup), so summing example statuses under-reports failures. Show `seed` in the run header — it is what makes an order-dependent failure reproducible.

**Effort:** Small; fields map almost 1:1 to the existing row model.

### PHP — PHPUnit

`--log-junit=<file>`, verified present in the current CLI builder ([Builder.php](https://raw.githubusercontent.com/sebastianbergmann/phpunit/main/src/TextUI/Configuration/Cli/Builder.php)). Reuse the existing junit parser — effort is effectively zero.

**Real information loss worth surfacing:** PHPUnit's **issue taxonomy** (risky / deprecation / notice / warning / incomplete) is first-class in config (`failOnRisky`, `failOnDeprecation`, …) but has **no JUnit XML representation** — those collapse into pass or skip. A green JUnit file can hide dozens of deprecations. A claimed deprecation of `--log-junit` in PHPUnit 10/11 is **[unverified]**; the option is still registered on `main`.

### Swift — .xcresult vs SwiftPM

**Is `.xcresult` parseable without the Xcode toolchain? Effectively no.** It is a proprietary content-addressed bundle with no public file-format spec; `xcresulttool` is macOS/Xcode-only. Corroborating evidence: Codecov explicitly lists `.xccov` as a **non-supported** format ([Codecov supported formats](https://docs.codecov.com/docs/supported-report-formats.md)).

**The correct integration is therefore `swift test --xunit-output`** (cross-platform, no Xcode), shelling out to `xcresulttool get test-results tests` only when Xcode is present.

Verified schema (from running `xcresulttool --schema` on a machine with Xcode): `{ testPlanConfigurations[], devices[], testNodes[] }`, where `TestNode` is **recursive** via `children[]` and `result` ∈ `Passed | Failed | Skipped | Expected Failure | unknown`.

**Traps.** `testNodes` is an **arbitrary-depth tree** — a flat parser silently drops most tests. **`Expected Failure` is a pass-like outcome** (`XCTExpectedFailure`); mapping it to "failed" produces false red. Only `durationInSeconds` is numeric.

**Effort:** Medium (tree flattening + macOS-gated external process).

---

## 2. Coverage

### What the formats actually carry

**LCOV `.info` record letters** — verified against lcov's own `geninfo` man page ([geninfo.1](https://manpages.debian.org/unstable/lcov/geninfo.1.en.html), [geninfo.rst](https://raw.githubusercontent.com/linux-test-project/lcov/master/docs/man/geninfo.rst)):

| Record | Meaning |
|---|---|
| `TN:` | test name (must precede its `SF:`) |
| `SF:` | source file — begins a section |
| `FNL:`/`FNA:` | current function format (LCOV ≥ 2.2) |
| `FN:` | **obsolete** function format; still read, no longer written |
| `FNDA:<count>,<name>` | per-function execution count |
| `FNF:` / `FNH:` | functions found / hit (count *groups* as of 2.2) |
| `BRDA:<line>,<block>,<branch>,<taken>` | one branch; `<taken>` is `-` if never evaluated |
| `BRF:` / `BRH:` | branches found / hit |
| `DA:<line>,<count>[,<checksum>]` | per-line execution count |
| `LH:` / `LF:` | **lines hit / lines found (instrumented)** |
| `end_of_record` | ends the section |

Two things matter here: **`LH` = hit and `LF` = found** (not alphabetical by meaning), and **LCOV has no statement-coverage record at all**.

**Other formats (verified from primary sources):**
- **Cobertura XML**: `line-rate`, `branch-rate`, `lines-valid`, `branches-valid`, `<line number hits branch condition-coverage>` ([coverage-04.dtd](https://raw.githubusercontent.com/cobertura/cobertura/master/cobertura/src/site/htdocs/xml/coverage-04.dtd)). **Rates are fractions 0–1, not percentages.**
- **JaCoCo XML**: `<line nr mi ci mb cb>` (missed/covered instructions and branches) and `<counter type missed covered>` with `type` ∈ `INSTRUCTION | BRANCH | LINE | COMPLEXITY | METHOD | CLASS` ([report.dtd](https://raw.githubusercontent.com/jacoco/jacoco/master/org.jacoco.report/src/org/jacoco/report/xml/report.dtd)).
- **Istanbul `coverage-final.json`**: keyed by **absolute** file path → `{ path, statementMap, fnMap, branchMap, s, f, b }` ([file-coverage.js](https://raw.githubusercontent.com/istanbuljs/istanbuljs/main/packages/istanbul-lib-coverage/lib/file-coverage.js)). **The only common format natively distinguishing statement, function, and branch.**
- **coverage.py**: four report commands verified — `coverage xml`, `coverage json`, `coverage lcov`, `coverage html` ([cmd docs](https://coverage.readthedocs.io/en/7.6.1/cmd.html)). JSON has both `percent_covered` and `percent_covered_display` (the latter rounded).
- **Go coverprofile**: `mode: set|count|atomic` then `file:l.c,l.c numStmt count`. **Statement blocks only — no branch, no function data.**

### Most universal interchange

**LCOV `.info` first, Cobertura XML second.** Evidence: Codecov ships processors for both and explicitly lists `.xccov`, `.ec`, `.exec`, `.coverage` (Python) and `.html` as **non-supported**, even recommending users convert SimpleCov JSON to lcov or cobertura ([Codecov supported formats](https://docs.codecov.com/docs/supported-report-formats.md)).

### How to display coverage honestly

**Never show a single number.** Show a four-metric row — line, statement, branch, function — and render **"n/a" for metrics the source format genuinely lacks**, rather than substituting line coverage. LCOV has no statement metric; Go has no branch or function metric; Cobertura has no function-count metric. Displaying "94% coverage" from `LH/LF` while branch coverage sits at 40% is the most common way coverage dashboards mislead.

**Always show the denominator.** A 100% figure over 12 instrumented lines means nothing. This also defends against the c8 `--all` trap: without it, V8 only reports files actually loaded, so **completely untested files vanish from the denominator** and inflate the percentage.

**Lead with what is not covered.** Google's testing team is explicit: *"a lot of the value of code coverage data is to highlight not what's covered, but what's not covered"*, and coverage *"does not guarantee that the covered lines or branches have been tested correctly, it just guarantees that they have been executed by a test."* Their published bands are **60% acceptable, 75% commendable, 90% exemplary**, offered with an explicit warning against top-down mandates ([Code Coverage Best Practices](https://testing.googleblog.com/2020/08/code-coverage-best-practices.html)).

Martin Fowler: coverage is *"of little use as a numeric statement of how good your tests are"* and *"high coverage numbers are too easy to reach with low quality testing"* ([TestCoverage](https://martinfowler.com/bliki/TestCoverage.html)).

**Patch coverage is what makes coverage actionable.** Codecov defines it as line coverage *of the lines changed in the diff*, rendered `absolute <relative> (change)`, e.g. `35% <72%> (+4%)` ([Coverage Percentages](https://docs.codecov.com/docs/coverage-percentages.md)). It answers the question a reviewer actually has, and stays high-signal even when project coverage is stuck. **But it requires a git diff and a base reference — a new data input, not a parser change.**

### Coverage traps

1. **Every conversion is lossy.** istanbul JSON → LCOV discards the statement/branch distinction; JaCoCo → Cobertura discards instruction counts and complexity. The report looks identical afterward.
2. **"Line coverage" is not one thing.** JaCoCo derives line status from *bytecode instructions* and has a **partial** state; LCOV's `DA:` is one count per line with no partial concept; Go has statement blocks, not lines. Comparing these across ecosystems is meaningless.
3. **Branch counting is heuristic.** lcov's own docs concede gcov *"do[es] not produce sufficient information to uniquely identify branch expressions - so lcov is forced to use a heuristic"*, and warn this makes cross-tool comparison *"potentially complicated"*. JaCoCo separately excludes exception handling from branches. **Branch % is not comparable across languages.**
4. **Absolute paths.** istanbul JSON is keyed by absolute path; coverage produced in a container will not match source paths rendered on a laptop.
5. **Rounding hides regressions.** `percent_covered` vs `percent_covered_display` exist separately precisely because display is rounded.

**Show it?** **Partial — a compact summary panel, not a coverage browser.** Show per-metric totals with denominators, a per-file table sorted by **uncovered count descending** (not percentage ascending — a 0%-covered 3-line file is noise), and explicit "not measured by this format" markers. **Omit per-line annotated source** — it defeats the single-file constraint for any real codebase; genhtml and JaCoCo already do this well.

**Effort:** LCOV summary panel **small**; multi-format 4-metric normalization **medium**; diff/patch coverage **large**; historical trend **large**.

---

## 3. Static analysis / linting

### Artifacts (flags verified)

| Tool | Exact flag | Shape |
|---|---|---|
| ESLint | `--format json` (also `json-with-metadata`) | JSON **array** of file results |
| ESLint → SARIF | `--format @microsoft/eslint-formatter-sarif` | SARIF 2.1.0 |
| Ruff | `ruff check --output-format <fmt>`; verified values: `concise, full, json, json-lines, junit, grouped, github, gitlab, pylint, rdjson, azure, sarif` | JSON / SARIF / JUnit |
| mypy | `--output json` — **json is the only value** | **JSON Lines**, not an array |
| tsc | **no JSON diagnostics format** | text only |
| clippy | `cargo clippy --message-format=json` | NDJSON |

Sources: [ESLint formatters](https://eslint.org/docs/latest/use/formatters/), [Ruff configuration](https://docs.astral.sh/ruff/configuration/), [mypy CLI](https://mypy.readthedocs.io/en/stable/command_line.html), [Cargo external tools](https://doc.rust-lang.org/cargo/reference/external-tools.html), [rustc JSON output](https://doc.rust-lang.org/rustc/json.html).

**ESLint key fields (verified against the official example):** top level is an **array**; `[].filePath`, `[].messages[].ruleId`, `.severity` (**1 = warn, 2 = error**), `.message`, `.line`, `.column`, `.endLine`, `.endColumn`, `.messageId`, `.fix.range`/`.fix.text`, `.suggestions[]`; per-file `errorCount`, `warningCount`, `fixableErrorCount`, `suppressedMessages`. **The `{results, metadata}` wrapper belongs to `json-with-metadata` only.**

### De-duplication

There is **no cross-tool standard fingerprint algorithm**, but three standard *fields* exist:

- **SARIF** `result.partialFingerprints` — the spec deliberately defers the algorithm ("Appendix B explains how a result management system can compute these fingerprints") ([SARIF 2.1.0 §3.27.17](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html)).
- **GitHub code scanning** — *"Code scanning only uses the primaryLocationLineHash"*; uploading via the API without it yields duplicate alerts ([GitHub SARIF support](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning)).
- **GitLab Code Quality** — `fingerprint` required per finding; identical fingerprints collapse to one entry ([GitLab docs](https://docs.gitlab.com/ci/testing/code_quality/)).

**Recommendation:** internal fingerprint = `sha256(tool ∥ ruleId ∥ repoRelativePath ∥ normalizedLineContentHash)` — hash the line **content**, not the line **number**, which churns on every unrelated edit above. Prefer an incoming `partialFingerprints` value when the source is SARIF.

### Severity normalization

Verified enums: SARIF `result.level` ∈ `error | warning | note | none` (§3.27.10), orthogonal to `result.kind` ∈ `pass | open | informational | notApplicable | fail` (§3.27.9). ESLint uses 0/1/2. GitHub bands `properties.security-severity`: **>9.0 critical, 7.0–8.9 high, 4.0–6.9 medium, 0.1–3.9 low**.

**Defensible normalization: adopt SARIF's four-value `level` internally.** It is the only OASIS-standardized scale, it is what GitHub/Azure/VS Code already consume, and its deliberate coarseness avoids fake precision. Map ESLint 2→error, 1→warning; rustc note/help→note. **Keep CVSS separate** as a numeric `securitySeverity` — SARIF has no `critical` level. Always retain the tool's raw severity string.

### Traps

- **Ruff's per-finding `severity` is effectively uniform** (`"error"` for both an import-order nit and a real bug) — do not use it for triage; the rule-code prefix is more informative.
- **mypy `--output json` is JSON Lines** — whole-file `JSON.parse` fails.
- **clippy NDJSON interleaves non-diagnostic lines** (`compiler-artifact`, `build-script-executed`); Cargo's docs advise interpreting a line as JSON only if it starts with `{`.
- **tsc has no machine format** — regex over `file(line,col): error TSxxxx:` is the only path, and it breaks under `--pretty` color codes.

**Show it?** **Partial.** A capped, sortable findings table (file:line, rule id, normalized severity, message, fixable?), counts by severity, top-N-rules. Cap at ~500/tool — inlining 5k findings blows the single-file budget. **Render "0 findings" as a passing gate row, not "0 tests".**

**Effort:** Medium — each shape is small alone, but a findings section plus normalization is a new report surface.

---

## 4. Security scanning

### What SARIF is and why it matters

SARIF = **Static Analysis Results Interchange Format**, an **OASIS Standard**. Current version is **2.1.0**, approved 27 March 2020, republished as **"Version 2.1.0 Plus Errata 01" on 28 August 2023** ([spec](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html)).

**2.2 is NOT released.** The OASIS TC repo contains a `sarif-2.2/` directory whose prose README describes it as *"the editable sources of the v2.2 SARIF specification (to be)"* ([oasis-tcs/sarif-spec](https://github.com/oasis-tcs/sarif-spec)). **Target 2.1.0.**

**Why it matters:** it is the only *standardized* finding interchange format, so one parser ingests Ruff, Trivy, Semgrep, Grype, osv-scanner, ESLint (via formatter), and CodeQL.

**Verified SARIF row fields:**

| Path | Meaning |
|---|---|
| `runs[].tool.driver.name` / `.version` / `.semanticVersion` | tool identity |
| `runs[].tool.driver.rules[]` | `reportingDescriptor`: `id`, `name`, `shortDescription.text`, `help.text`, `defaultConfiguration.level`, `properties.tags[]`, `properties.security-severity` |
| `results[].ruleId` | rule reference |
| `results[].level` | `error`/`warning`/`note`/`none` |
| `results[].message.text` | finding text |
| `results[].locations[].physicalLocation.artifactLocation.uri` | file URI |
| `…physicalLocation.region.startLine` | + `startColumn`, `endLine`, `snippet` (§3.30) |
| `results[].partialFingerprints` | dedupe identity |
| `results[].baselineState` | `new` / `unchanged` / `updated` / `absent` (§3.27.24) |
| `results[].suppressions` | **absent/null = info unavailable ⇒ not suppressed**; empty array = evaluated, not suppressed (§3.27.23) |

**GitHub's ingestion limits bound any aggregation design:** 10 MB gzipped/file; 20 runs/file; 25,000 results/run (only top 5,000 kept); 1,000 locations/result.

### Scanner artifacts

`npm audit --json` (verified flag and `--audit-level` config at [npm docs](https://docs.npmjs.com/cli/v10/commands/npm-audit)); `pip-audit -f json|cyclonedx-json|cyclonedx-xml|markdown` — **no `sarif` choice**; `trivy --format sarif|json|cyclonedx`; `semgrep --sarif|--json`; `osv-scanner --format sarif` where *"each vulnerability (grouped by aliases) is a separate rule"* ([osv-scanner output](https://google.github.io/osv-scanner/output/)).

**npm audit v6 vs v7+ is a real shape change.** v6 emitted `advisories` keyed by numeric id plus `actions`; v7+ emits `auditReportVersion: 2` with a package-keyed `vulnerabilities` map. **Detect by presence of `auditReportVersion`, not by npm version.**

### SBOM is adjacent but different

**CycloneDX and SPDX are inventory formats, not findings.** Verified by shape: osv-scanner's CycloneDX output is `{"bomFormat":"CycloneDX","specVersion":"1.5","components":[…]}`. pip-audit's `--desc` flag explicitly *"has no effect on the cyclonedx-json or cyclonedx-xml formats"* — vulnerability descriptions are not carried. **Never accept an SBOM as a findings source.**

### Traps

- **npm audit counts mislead.** One package can hold several advisories at different severities in `via[]` while `metadata.total` counts 1. Advisory-count ≠ package-count — state which you display.
- **`via[]` is heterogeneous** — either an advisory object or a bare package-name string. Type-check each element.
- **npm audit hits the network and is nondeterministic over time.** The same lockfile yields different counts as advisories are published. Never treat its exit code as a stable test result without `--audit-level`.
- **Severity words are not interchangeable**: npm `info/low/moderate/high/critical`; Trivy `LOW…CRITICAL`; SARIF has 4 levels and no "critical". Keep the CVSS number.
- **Tools dedupe differently** — osv-scanner groups by **alias set**, so one CVE appears as GHSA-x in one tool and CVE-y in another. De-dupe on the alias set.

**Show it?** **Partial.** Severity counts, a table of *unique advisories* (id, package@version, fixed version, severity, CVSS, link), fixable/not-fixable split. Omit advisory prose, dependency-path trees, the SBOM, and raw CVSS vectors.

**Effort:** Medium (SARIF-only) → large (native per-tool coverage, which needs a package-keyed row model).

---
## 5. Performance / load testing

### Artifacts (flags verified)

| Tool | Verified invocation | Shape |
|---|---|---|
| k6 | `handleSummary(data)` returning `{'summary.json': JSON.stringify(data)}` — **the recommended path** | JSON |
| k6 | `k6 run --summary-export export.json` | JSON |
| k6 | `k6 run --out json=results.json` | NDJSON sample stream |
| Artillery | `artillery run --output report.json` | JSON |
| Locust | `locust --csv example --headless` → `_stats`/`_failures`/`_exceptions`/`_stats_history`.csv | 4 CSVs |
| JMeter | `-l results.jtl`; `jmeter.save.saveservice.output_format=csv|xml` | CSV or XML |
| hyperfine | `--export-json bench.json` (also `--export-markdown`, CSV) | JSON |

**`--summary-export` status: not deprecated, but officially discouraged.** k6's options reference states verbatim: *"While this feature is not deprecated yet, we now discourage it… use the `handleSummary()` function"* ([k6 options reference](https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/)).

**Important and current:** k6 v1.5.0 added an opt-in machine-readable summary via `--new-machine-readable-summary`, with a published JSON Schema at [grafana/k6-summary](https://github.com/grafana/k6-summary), and it *"will become the default in k6 v2"* ([custom summary docs](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/)). **Build the k6 parser against the schema-backed format and keep the legacy `data.metrics` shape as a fallback.**

### Key fields

**k6 metric names** (verified verbatim at [metrics reference](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)): `http_req_blocked`, `http_req_connecting`, `http_req_duration`, `http_req_failed` (Rate), `http_req_receiving`, `http_req_sending`, `http_req_tls_handshaking`, `http_req_waiting`, `http_reqs`; plus `checks`, `data_received`, `data_sent`, `dropped_iterations`, `iteration_duration`, `iterations`, `vus`, `vus_max`.

**Default `summaryTrendStats` = `avg,min,med,max,p(90),p(95)` — p99 is NOT on by default.** A hardcoded p99 column will be empty unless the user configured it.

**Locust `_stats.csv` columns** (from [stats.py](https://github.com/locustio/locust/blob/master/locust/stats.py)): `Type, Name, Request Count, Failure Count, Median Response Time, Average Response Time, Min Response Time, Max Response Time, Average Content Size, Requests/s, Failures/s` plus percentile columns.

**JMeter JTL**: `timeStamp, elapsed, label, responseCode, responseMessage, threadName, dataType, success, failureMessage`; XML attrs `ts, t, lt` (latency = time to initial response), `ct` (connect), `lb, rc, rm, s, by, sby` ([listeners docs](https://jmeter.apache.org/usermanual/listeners.html)).

**hyperfine `results[]`**: `command, mean, stddev` (nullable), `median, user, system, min, max, times[], exit_codes[], parameters{}` — all seconds.

### Which metrics matter

Use the **four golden signals — latency, traffic, errors, saturation** ([Google SRE book, Ch. 6](https://sre.google/sre-book/monitoring-distributed-systems/)). Two directly applicable quotes:

- *"It's important to distinguish between the latency of successful requests and the latency of failed requests… a slow error is even worse than a fast error."* → **never fold error latency into the headline latency number.**
- *"Latency increases are often a leading indicator of saturation. Measuring your 99th percentile response time over some small window… can give a very early signal of saturation."*

**Why the mean misleads** — same chapter: *"If you run a web service with an average latency of 100 ms at 1,000 requests per second, 1% of requests might easily take 5 seconds… the 99th percentile of one backend can easily become the median response of your frontend."* The prescribed fix is explicit: *"collect request counts bucketed by latencies (suitable for rendering a histogram), rather than [a mean]."*

**Coordinated omission.** Gil Tene's *"How NOT to Measure Latency"* covers *"the fallacy of using standard deviation measurements… and how back pressure and coordinated data omission issues can literally skew measurement results by orders of magnitude"* ([QCon London 2013](https://qconlondon.com/ln2018/london-2013/qconlondon.com/london-2013/presentation/How%20NOT%20to%20Measure%20Latency.html)). Mechanism and remedy in [wrk2](https://github.com/giltene/wrk2): closed-loop generators stall when the server stalls, so slow responses are never sampled.

**Consequence:** a p99 from an open-model generator and a p99 from a closed-loop VU generator **are not comparable numbers**. If both appear in one table, the load model must be labeled.

### Defensible threshold model

k6 thresholds codify SLOs; valid aggregations by type: Counter → `count, rate`; Gauge → `value`; Rate → `rate`; Trend → `avg, min, max, med, p(N)` ([thresholds docs](https://grafana.com/docs/k6/latest/using-k6/thresholds/)). Canonical example: `http_req_failed: ['rate<0.01']`, `http_req_duration: ['p(95)<200']`.

**Absolute wall-clock thresholds on a laptop are not defensible**, and Grafana's own automation guide says so ([automated performance testing](https://grafana.com/docs/k6/latest/testing-guides/automated-performance-testing/)):
1. Infrastructure that does not match production is *"unsuitable for assessing the performance and scalability of the application"*.
2. *"It's critical to compare test run results of the same test… Compare identical test runs, the same workload… against the same environment."*
3. It recommends running the same test **twice, almost consecutively**, to collect an extra result and *"ignore a potentially unreliable test."*
4. It warns that *"Quality gates in CI/CD may result in false assurance"* and advises starting with warn-only criteria.

**Recommended model:** treat perf thresholds as **relative-to-baseline with an explicit environment tag**, defaulting to **warn, not fail**; require ≥2 consecutive runs before declaring a regression; render absolute thresholds only for a pinned environment. **Warmup as an officially prescribed practice is [unverified]** — treat "discard the first N seconds" as our own convention, and note that k6's `iteration_duration` includes `setup`/`teardown`.

### Traps

- **Locust percentiles are approximated** — `bucket_response_time` rounds to ~2 significant digits; Locust's own console says *"Response time percentiles (approximated)"*. Do not present as exact.
- **JMeter "csv" may not be comma-separated** and **column presence is configuration-dependent** — read the header row; never assume a fixed schema.
- **JMeter `elapsed` ≠ `Latency`** — `lt` is time to *initial response*, `t` is full elapsed.
- **k6 `http_req_duration` excludes DNS/connect time** — a green threshold can coexist with terrible user-perceived latency if `http_req_blocked` is large.
- **k6 `checks_total`/`checks_succeeded`/`checks_failed` are display-only** and cannot be thresholded.
- **Lossy conversion:** k6's jslib `jUnit()` helper emits one `<testcase>` per *threshold*, losing every distribution. If a user feeds us k6-derived JUnit we have pass/fail only — detect and say so rather than implying we have latency data.

**Show it?** **Partial.** Show one row per metric+threshold pair (maps onto the existing row model for free via `thresholds.{expr}.ok`), a per-endpoint table (count, error rate, p50–p99, RPS), the four golden signals with errors broken out, the **load model**, and a latency histogram. **Omit raw sample streams** — a 30-minute JTL is 10⁶+ rows and defeats "single-file". Omit mean-only summaries and latency standard deviation.

**Effort:** **Large** for the defensible version (distributions, baselines, variance = new data model + history + statistics). The narrow first slice — parse k6 `handleSummary` JSON + hyperfine `--export-json` into a threshold-results table — is genuinely **small**.

---

## 6. API / contract testing

### Artifacts

| Tool | Verified artifact | Note |
|---|---|---|
| newman | `newman run <col> -r json --reporter-json-export <path>` | built-ins are exactly `cli, json, junit, progress, emojitrain` |
| Dredd | `-r xunit|nyan|dot|markdown|html|apiary` | **no JSON reporter**; OpenAPI 3 support **experimental** |
| Schemathesis | Allure + JUnit XML | property-based from OpenAPI/GraphQL |
| Pact | pact JSON + broker verification results | [v2](https://github.com/pact-foundation/pact-specification/tree/version-2) / [v3](https://github.com/pact-foundation/pact-specification/tree/version-3) |
| oasdiff | `oasdiff breaking <base> <revision>` | contract drift |

**newman summary shape:** `summary.run.stats`, `summary.run.failures`, and **`summary.run.executions`** (the per-test row source). The JSON reporter's content is *"exactly the same as the `summary` parameter sent to the callback"* ([newman README](https://github.com/postmanlabs/newman)).

**Pact file:** `consumer{name}`, `provider{name}`, and **`interactions`** — *"Each pact is a collection of interactions"* ([how Pact works](https://docs.pact.io/getting_started/how_pact_works)). v3 changes `query` to a map, replaces `providerState` with `providerStates: [{name, params}]`, and changes `matchingRules` to `{"matchers": [...]}`. Formal JSON Schemas exist at [pactflow/pact-schemas](https://github.com/pactflow/pact-schemas) — use them rather than hand-rolling.

**`can-i-deploy`** queries the **Pact Matrix** (consumer version × provider version × verification success) ([docs](https://docs.pact.io/pact_broker/can_i_deploy)). This is a **remote query, not a local test result.**

**JSON Schema** current version is **2020-12**, and the project publishes a **recommended output schema** for structured validation results ([spec](https://json-schema.org/specification)) — the right target for per-keyword errors instead of a rendered string.

**oasdiff** detects **681 distinct API changes: 317 breaking, 17 warnings, 347 informational** ([breaking-changes docs](https://www.oasdiff.com/docs/breaking-changes)).

### What a good API report shows

Per request: **method + path + expected/actual status + latency**, then a **schema-conformance verdict with the exact failing JSON Pointer and keyword** (e.g. `/data/0/createdAt` failed `format: date-time`) — not a prose blob. Plus **contract drift as its own severity-ranked section** using oasdiff's own breaking/warning/informational taxonomy, the auth scheme exercised, **which operations were never exercised** (the most common silent failure in API testing), and retry/attempt count so a pass that took 4 attempts is visibly distinct from a clean pass.

**Omit** full request/response bodies by default — secrets and size; show a truncated, redacted diff behind click-to-expand.

### Traps

- **Dredd's OpenAPI 2 mode tests only 2xx responses by default**, marking others skipped. A 100%-green Dredd run can mean the error paths were never touched.
- **Pact green ≠ provider correct.** Pact only verifies interactions some consumer declared; unclaimed endpoints are untested by construction, and the spec notes you **cannot** verify that a key or header is absent. Requests are matched strictly while responses are matched laxly — a report must not imply "full response validated".
- **JSON Schema dialect divergence** (2020-12 vs 2019-09 vs draft-07) is real; report the `$schema` alongside the verdict.
- **newman silently suppresses CLI output** when other reporters are enabled unless `cli` is explicitly included.
- **oasdiff judges the contract, not the server** — a lenient server does not make a change non-breaking.
- **Schemathesis failures are randomized inputs** — a row without the **seed/reproduction command** is not actionable.
- `newman-reporter-htmlextra` official status: **[unverified]**.

**Show it?** **Yes** — this is the closest fit to the existing per-test row model of all researched areas.

**Effort:** **Medium.** newman JSON alone is small and maps almost directly onto existing rows; the medium comes from the second section — schema-conformance and drift are a *finding-with-severity-and-pointer* row type needing normalization and new rendering.

---

## 7. E2E beyond Playwright

**The whole answer to this area is one distinction:** browser E2E splits into **automation libraries/protocols** that drive a browser and **test runners** that own discovery, assertions, retries, and reporting. **Only runners produce results.**

| Tool | Is it a runner? | Machine-readable output |
|---|---|---|
| Cypress | yes (bundles Mocha) | any Mocha reporter; bundles `junit` + `teamcity` |
| **Selenium/WebDriver** | **no — a protocol** | **none** |
| **Puppeteer** | **no — a library** | **none** |
| WebdriverIO | yes | junit, json, allure, spec, dot |
| Nightwatch / TestCafe | yes | **[unverified]** |

**Cypress**, verbatim: *"Because Cypress is built on top of Mocha, that means any reporter built for Mocha can be used with Cypress"*; it bundles *"the two most common 3rd party reporters for Mocha… teamcity [and] junit"* with no install ([Cypress reporters](https://docs.cypress.io/app/tooling/reporters)). Note `--reporter json` is a **Mocha** built-in, not a Cypress feature.

Cypress's Module API / `after:run` object is a **run-level summary only** (`totalDuration, totalSuites, totalTests, totalFailed, totalPassed, totalPending, totalSkipped, browserName, browserVersion, osName, osVersion, cypressVersion`) and is **`undefined` in `cypress open`** ([after:run API](https://docs.cypress.io/api/plugins/after-run-api)). Per-test rows still come from a reporter.

**Selenium/WebDriver framing confirmed:** the [W3C WebDriver spec](https://www.w3.org/TR/webdriver2/) defines itself as *"a remote control interface that enables introspection and control of user agents… a platform- and language-neutral wire protocol"*. There is no result or report concept anywhere in that scope. **Puppeteer is the same** — *"a JavaScript library which provides a high-level API to control Chrome or Firefox"* ([README](https://github.com/puppeteer/puppeteer)).

**WebdriverIO**'s `@wdio/junit-reporter` *"will output a report for each runner, so in turn you will receive an XML report for each spec file"* — many files to merge, with `classname="chrome.a_test_case"` and `<properties>` carrying `specId`, `suiteName`, `capabilities`, `file` ([docs](https://webdriver.io/docs/junit-reporter)).

**Allure** is a report generator plus intermediate format, decoupled from any runner. `{uuid}-result.json` carries `uuid`, `historyId` (stable across runs — this powers history/flakiness), `testCaseId`, `name`, `fullName`, `links[]`, `labels[]`, `parameters[]`, `attachments[]{name, source, type}`, `status`, `statusDetails`, `stage`, `start`, `stop`, and recursive `steps[]` ([format docs](https://allurereport.org/docs/how-it-works-test-result-file/)). Attachments are **separate files**, so allure-results is a **directory, not a file**. It is a de-facto ecosystem standard (40+ first-party adapters) but **not a ratified specification** — its own docs say *"Understanding this format is not necessary for using Allure."*

### Conclusion: support the RUNNER's format, not the automation library

This is structural, not stylistic:
1. Selenium/WebDriver and Puppeteer **have no result format at all** — there is literally nothing to parse.
2. Cypress's machine-readable output **is** Mocha's, by its own documentation.
3. WebdriverIO's most portable output is JUnit XML.
4. **Cypress→junit, WebdriverIO→junit, Selenium/TestNG/pytest→junit all collapse onto a parser we already own.**

**Do not advertise "Selenium support" or "Puppeteer support."** It misrepresents what is happening and creates support burden for a format that does not exist. Advertise the runner.

**What to add beyond JUnit:** browser/platform/capability per test, retry/attempt count, and screenshot/video/trace attachments. **Omit videos** (huge — link or drop, never inline) and full trace archives.

**Effort:** **Small** for the recommended path (dialect-hardening + multi-file merge + documentation). **Medium** only if we ingest allure-results.

---

## 8. Snapshot / golden testing

**What it is.** Comparing a computed value against a committed reference artifact, with tooling to review and bulk-accept intentional changes. The failure mode is a **diff** and the human action is **review-and-approve** — a fundamentally different UX from pass/fail.

### How mismatches are reported — mostly unstructured

**Jest is the exception and gives real structure** ([jest-test-result types.ts](https://github.com/jestjs/jest/blob/main/packages/jest-test-result/src/types.ts)):
- `SnapshotSummary`: `added, didUpdate, failure, filesAdded, filesRemoved, filesRemovedList, filesUnmatched, filesUpdated, matched, total, unchecked, uncheckedKeysByFile, unmatched, updated`
- per test file: `snapshot: { added, fileDeleted, matched, unchecked, uncheckedKeys, unmatched, updated }`

**But the diff itself is not structured** — per-assertion, `failureMessages` is an array of strings with ANSI codes; the rendered diff lives inside that string. **So: counts are structured; diffs are text blobs we must sanitize.** Do not claim structured line-level diffs unless we re-diff from the `.snap` ourselves.

**Obsolete snapshots are a first-class signal Jest already hands us** (`unchecked`, `uncheckedKeysByFile`, `filesRemovedList`) that almost every report ignores. Surfacing "12 obsolete snapshots" is cheap and genuinely useful.

**Go caveat — do not overstate.** Go has **no built-in golden-file feature**. The [`testing` package docs](https://pkg.go.dev/testing) only formally document `testdata/fuzz/<Name>` for the fuzzing seed corpus. The ubiquitous `-update` flag is a **per-project hand-rolled `flag.Bool`, not a standard-library or `go test` flag** — **[unverified as a standard]**. Support via the generic shell path only. ApprovalTests file naming is also **[unverified]**.

### Visual regression

**Playwright** baselines live in `<spec-file>-snapshots/` named e.g. `example-test-1-chromium-darwin.png` — **browser name and platform are in the filename** because rendering differs across them. Comparison uses **pixelmatch**, with verified tolerance options: `maxDiffPixels` (absolute count), `maxDiffPixelRatio` (0–1), and `threshold` = *"acceptable perceived color difference in the YIQ color space… between zero (strict) and one (lax)"*, **default 0.2** ([test-snapshots](https://playwright.dev/docs/test-snapshots), [PageAssertions](https://playwright.dev/docs/api/class-pageassertions)).

**Artifact suffixes verified from source**: `-expected`, `-actual`, `-diff`, `-previous` ([toMatchSnapshot.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright/src/matchers/toMatchSnapshot.ts)). This triple arrives as Playwright report attachments — **which Test Observatory already ingests.**

Playwright also warns rendering *"can vary based on the host OS, version, settings, hardware, power source (battery vs. power adapter), headless mode"* — worth quoting to explain laptop-vs-CI diffs.

**Percy/Chromatic**: their review state lives on a server, **structurally incompatible** with a self-contained no-server HTML file. Their artifact formats are **[unverified]**. At most, render a link.

### What makes a snapshot failure reviewable

Show **counts first** (including obsolete), then **text diffs** ANSI-stripped, HTML-escaped, and truncated with an explicit "N more lines" marker. For images, an **expected | actual | diff triptych** with: (a) side-by-side at equal scale, (b) an **opacity slider or onion-skin overlay**, (c) click-to-zoom at 1:1 device pixels, (d) **the numeric diff magnitude shown next to its configured tolerance** — a diff without its threshold is unreviewable, (e) the **platform/browser tag from the filename**, the #1 cause of false positives, and (f) the exact update command (`jest -u -t "<name>"`, `playwright test --update-snapshots`, `cargo insta review`) so review converts to action.

**Bound the inlining.** Base64 inflates bytes ~33%. Concrete policy: inline **only for failing** snapshots, **only the diff plus a downscaled expected/actual pair**, with a per-image byte cap and a global report budget, degrading to "diff only", then "counts + path only". **Never inline passing snapshots or videos.**

### Traps

- **Snapshot tests silently rubber-stamp bugs.** `-u` accepts whatever ran. A report showing "updated: 47" without listing *which* is actively harmful.
- **Nondeterministic content**: Jest property matchers **replace the value in the stored snapshot**, so placeholders in a `.snap` are not corruption.
- **Inline snapshots mutate source files** (Jest and Vitest both).
- **Tolerance semantics are not interchangeable**: Playwright `threshold` is a *per-pixel YIQ color* tolerance; `maxDiffPixelRatio` is a *fraction of pixels*; BackstopJS `misMatchThreshold` is a *percentage of differing pixels*. **Normalizing these into one "tolerance" column would be a misleading metric** — label by tool.
- **syrupy fails on missing snapshots** deliberately, where other libraries silently create them.

**Effort:** **Medium overall, usefully splittable.** Snapshot **counts** = a few extra columns from JSON we already parse (**small**). Text-diff rendering (**medium**). Image review UI + byte budgeting (**medium→large**).

---
## 9. Flaky test detection

**What it is.** A flaky test produces both passing and failing outcomes **on the same code**. Detection is a *statistical claim about an outcome distribution*, not a property of one run.

**There is no standard flakiness format.** Flakiness rides in existing formats as a status, produced by rerun flags. JUnit XML has **no standard `flaky` element** — vendor `flaky` attributes (Surefire, nextest) are dialect extensions. Any normative JUnit-XML flaky attribute name is **[unverified]**.

| Tool | Verified flag | Semantics |
|---|---|---|
| Bazel | `--flaky_test_attempts=N` | *"Tests that required more than one attempt to pass are marked as 'FLAKY'"* |
| Bazel | `--runs_per_test=N` | **"If any of those attempts fail for any reason, the whole test is considered failed"** |
| Bazel | `--runs_per_test_detects_flakes` | *"any shard in which at least one run/attempt passes and at least one run/attempt fails gets a FLAKY status"* |

Note that `--runs_per_test` and `--flaky_test_attempts` have **opposite polarity** — conflating them inverts the verdict.

### Google's published numbers (exact)

All from [Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html), verified verbatim this session:

- *"across our entire corpus of tests, we see a continual rate of about **1.5% of all test runs** reporting a 'flaky' result"* — **% of RUNS**.
- *"Almost **16% of our tests** have some level of flakiness associated with them! … more than 1 in 7"* — **% of TESTS**.
- *"about **84% of the transitions we observe from pass to fail involve a flaky test**"* — and this is exactly why the naive heuristic fails.
- Definition: *"a test that exhibits both a passing and a failing result **with the same code**"*.
- Their rerun policy: a test can be denoted flaky *"causing it to report a failure only if it **fails 3 times in a row**"* — which they call *"hardly a perfect solution"*, since a 15-minute test needs 45 minutes to confirm a real break.
- Quarantine risk, in their own words: it *"removes the test from the critical path and files a bug… but **could easily mask a real race condition or some other bug**"*.
- Alarm fatigue: *"developers dismiss a failing result as flaky only to later realize that it was a legitimate failure… It is human nature to ignore alarms when there is a history of false signals."*

**These two numbers are constantly swapped and are not comparable: 1.5% is % of test runs; 16% is % of tests.**

### Meta's Probabilistic Flakiness Score

Meta's PFS *"measures how likely the test is to fail, provided it could have passed **on the same version of code and in the same state of the world**, had it been retried an arbitrary number of times"* ([Engineering at Meta](https://engineering.fb.com/2020/12/10/developer-tools/probabilistic-flakiness/)). It is genuinely Bayesian (implemented in Stan, yielding a posterior rather than a point estimate), requires **no extra test runs** (it piggybacks on normal CI), and has been deployed since mid-2018.

Its framing is deliberately asymmetric and worth adopting: *"A passing test indicates the absence of corresponding regression, while a failure is merely a hint to run the test again."* Meta also states *"all real-world tests are flaky to some extent"*, so *"the right question to ask is not whether a particular test is flaky, but how flaky it is."*

**Other methods:** FlakeFlagger (ICSE 2021) predicts flakiness from behavioral features without reruns, and reported *"far fewer false positives"* than the prior state of the art. Notably, its study reran 24 projects' suites **10,000 times each** and *still* found some known flaky tests undetected — rerun-based detection is a strict lower bound, not ground truth.

### Why "passed then failed = flaky" is wrong

Four independently sufficient reasons:

1. **It is not conditioned on the code.** Every authoritative definition requires *same code*. A pass at SHA1 followed by a failure at SHA2 is **the signature of a real regression** and is indistinguishable from flakiness on the pass→fail bit alone. Google's own measurement — **84% of pass→fail transitions involve a flaky test** — cuts both ways: the remaining 16% are real breaks that this heuristic would suppress.
2. **It is not conditioned on the environment.** Meta separates "probability of bad state" from PFS precisely because a deterministic test broken by a global config change fails repeatedly while its **PFS is near zero**.
3. **Order-dependence is a real bug, not noise.** Dependent tests are deterministic; test ordering is simply an unacknowledged input. Calling them flaky hides a genuine isolation defect.
4. **The cost is asymmetric.** Mislabeling a regression as flaky ships a bug, and trains engineers to ignore true alarms.

**Minimum evidence to call something flaky:** ≥1 pass AND ≥1 fail at the **same commit SHA**, under a **held-constant environment**, over **N ≥ 2 attempts**.

### What a report should show given ONE run

**Be honest: with a single run you basically cannot detect flakiness.** This is definitional, not a tooling gap.

- **Show:** per-test `attempts` when the runner actually reran, labeled **"retried" / "passed on retry"** — **never "flaky"**; the commit SHA and environment; a count of retried-then-passed tests as a row class distinct from pass/fail.
- **Omit/refuse:** any flakiness score, flip-rate, or "flaky" verdict derived from a single run.
- **Embed verbatim:** *"This report covers one run. Flakiness is defined as a test both passing and failing on the same code, which requires multiple attempts under a fixed commit and environment to observe; a single run cannot establish it."*

**Effort:** **Small** for retry/attempt display. **Large** for real detection — needs persisted cross-run history keyed by (test id, SHA, environment) plus a statistical model, which is explicitly outside a self-contained single-file report.

---

## 10. Test impact analysis / selective testing

**What it is.** Running a subset chosen as plausibly affected, trading coverage for latency. Develocity states the trade outright: *"You trade full test coverage for faster feedback."*

| Tool | Basis | Verified invocation |
|---|---|---|
| Bazel | build graph + action cache | implicit; hermeticity is a **mandate** — *"If tests are not properly hermetic then they do not give historically reproducible results"* ([test encyclopedia](https://bazel.build/reference/test-encyclopedia)) |
| Nx | project graph + Git | `nx affected -t <task>` ([docs](https://nx.dev/ci/features/affected)) |
| Turborepo | package graph + Git range | `turbo run test --affected` (≡ `--filter=...[main...HEAD]`) |
| pytest-testmon | **coverage-based** per-test deps in `.testmondata` | `pytest --testmon` ([testmon.org](https://www.testmon.org/)) |
| Jest | static dependency graph + VCS | `--onlyChanged`, `--changedSince=<ref>`, `--findRelatedTests` ([docs](https://jestjs.io/docs/cli)) |
| Gradle Develocity PTS | **ML model** on Build Scan data | profiles Conservative/Standard/Fast |
| Azure DevOps TIA | impact data collector | "Run only impacted tests" ([docs](https://learn.microsoft.com/en-us/azure/devops/pipelines/test/test-impact-analysis?view=azure-devops)) |

**None of these emit a selection artifact in a standard format** — selection is a side effect; the run still emits normal JUnit/JSON. Any standardized "test selection manifest" format is **[unverified]**.

### What selective testing MISSES

- **Non-source files:** Azure TIA — *"if the code commit contains changes to HTML or CSS files, it can't reason about them and falls back to running all tests."* It is also explicitly unsupported for multi-machine topology, **data-driven tests**, .NET Core, and UWP.
- **Dynamic dispatch/reflection:** Jest's `--onlyChanged` *"requires a static dependency graph (ie. no dynamic requires)"*.
- **Undeclared deps:** Bazel's guarantee is *conditional on hermeticity*.
- **Hidden inter-test deps:** testmon warns selection *"is likely to expose undesired test dependencies."*
- **Shallow clones:** Turborepo — *"If the checkout is too shallow, then all packages will be considered changed."* Nx's affected set is computed *relative to the last successful run on main* — a baseline **state**, not a pure function of the diff.
- **ML is probabilistic by construction** — PTS trades *"reduced confidence in catching all failures"* for savings.
- **Safe fallback is a required feature**, not a nicety: Azure TIA ships explicit fallback-to-all-tests plus configurable periodic full runs.

### Report implications — this is the highest-value honesty fix

**A green report over a subset is a materially different claim from a green full-suite report, and the reader cannot distinguish them unless told.**

- **Show in the header, not a footnote:** *"Selective run: 128 of 3,412 known tests executed; 3,284 not run"*, plus selection basis, the base…head SHA range, and any fallback-to-full events.
- **Add a distinct third row state: `not run (deselected)`.** Never fold deselected into "passed", and **never into "skipped"** — skipped means the runner reached it and declined; deselected means it was never considered. **This is the single highest-value correctness change identified in this entire research.**
- **Omit:** any subset-derived pass rate presented as a suite-level pass rate; any "100% passing" badge on a selective run.

**Traps.** "% saved" is a misleading headline — Nx warns that modifying a widely-depended-on project *"might end up running tasks for almost all the projects"*. Coverage-based selection over-selects on signature changes (testmon: *"If you changed a method parameter name, you effectively changed the whole hierarchy"*). Turborepo/Nx deselect whole **packages**, so per-test rows for deselected packages **do not exist** in the artifact — the report must model **absence**, not zero.

**Effort:** **Medium.** No new parser and no statistics, but it needs a selection-aware normalization layer: a `not run (deselected)` row state, a known-total denominator, and a header section for selection basis and diff range.

---

## 11. Accessibility as a test category

### The 57% vs 80% discrepancy — RESOLVED

- **57% (engineering claim), verified verbatim in the axe-core README:** *"With axe-core, you can find **on average 57% of WCAG issues automatically**. Additionally, axe-core will return elements as 'incomplete' where axe-core could not be certain, and manual review is needed."* ([axe-core README](https://github.com/dequelabs/axe-core))
- **57.38% (the underlying study):** *"On average across all the audits included in the sample data, we found that **57.38% of total issues** were identified using Deque's automated tests"* — from 13,000+ page states and ~300,000 issues ([Deque coverage report](https://www.deque.com/automated-accessibility-testing-coverage/)).
- **80% is a DIFFERENT PRODUCT, not a stronger axe-core claim.** A Deque maintainer states it directly: *"automated testing frameworks such as axe-core can only catch about 57% of accessibility issues. The **80% comes from the axe DevTools extension which can use our Intelligent Guided Tests (IGT)**… So if you are able to use IGT it can help catch up to 80% issues, otherwise its about 57% coverage"* ([axe-core issue #4415](https://github.com/dequelabs/axe-core/issues/4415)). **IGT is human-in-the-loop, so 80% is not an automated-only number.**
- **The real trap is the denominator switch.** Deque itself concedes: *"In our analysis we found automated issues for **16 out of the 50 Success Criteria** under WCAG 2.1 Level AA. This supports the 20 to 30% automated coverage claims that many experts claim today."* The 57% is a percentage of **issue instances**, not of **success criteria**, and instance counts are dominated by a handful of rules (contrast, alt text, labels). **57% of instances ≈ 32% of AA success criteria (16/50).** Citing 57% as "coverage" without naming the denominator is not defensible.

### Tools and artifacts

| Tool | Verified invocation | Output |
|---|---|---|
| axe-core | `axe.run()` | `passes`, `violations`, `incomplete`, `inapplicable` |
| Pa11y | `pa11y <url> --reporter json`; `--runner htmlcs|axe` | JSON array |
| IBM Equal Access | `npx achecker` | JSON, CSV, HTML, XLSX + **baselines** |
| Lighthouse | accessibility category | JSON, weighted score |
| WAVE | `GET wave.webaim.org/api/request?key=…` | JSON or XML, credit-metered |

**axe-core key fields:** `id`, `description`, `help`, `helpUrl`, `impact` (`minor|moderate|serious|critical`), `tags` (**where WCAG mapping lives**), `nodes[]` with `html`, `target` (CSS selector; array entry per iframe level).
**Pa11y key fields:** `code` (e.g. `WCAG2AA.Principle1.Guideline1_1.1_1_1.H30.2`), `context`, `message`, `selector`, `type`, `typeCode`.
IBM accessibility-checker's exact JSON field names are **[unverified]** — do not invent them.

**Pa11y exit codes matter for the shell path:** `0` = no errors, `1` = **technical fault**, `2` = page has errors. **`--level none` always exits `0`** — an exit-code-only integration can be silently neutered.

### Lighthouse: a score of 100 does NOT mean accessible

*"The Lighthouse Accessibility score is a **weighted average of all accessibility audits**"*, audits are binary with no partial credit, and decisively: **manual audits are excluded from the score entirely** ([Lighthouse accessibility scoring](https://developer.chrome.com/docs/lighthouse/accessibility/scoring)). Lighthouse ships a separate manual-checks list (keyboard focusability, logical tab order, focus trapping, visual order matching DOM order…) that does not affect the number. **A 100 means "every scored, automatable, axe-derived audit passed" — a strict subset of an already-partial subset.**

### WebAIM Million (latest, February 2026)

From [webaim.org/projects/million](https://webaim.org/projects/million/), verified this session:
- **95.9% of home pages had detected WCAG 2 failures** — up from 94.8% in 2025, *"reversing a trend of small improvements each of the previous 6 years."*
- *"Because only automatically detectable WCAG failures were considered, this suggests that the rate of full WCAG 2 A/AA conformance was **certainly lower than 4.1%**."*
- 56,114,377 errors; **average 56.1 errors per page** (+10.1% YoY); average 1,437 elements per page (+22.5% in one year).
- Top failures: low contrast **83.9%**, missing alt text **53.1%**, missing form labels **51%**, empty links **46.3%**, empty buttons **30.6%**, missing document language **13.5%** — *"96% of all errors detected fall into these six categories."*
- WebAIM's own limit statement: *"Absence of detected errors does not indicate that a page is accessible or conformant."*

### What coverage claims are defensible

W3C is unambiguous: *"Some accessibility checks just cannot be automated and require manual intervention"* and tools *"cannot check all accessibility aspects automatically. Human judgement is required"* ([W3C WAI selecting evaluation tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/)).

- **Defensible:** "automated checks found N instances of M rules"; "automated rules cover a subset of WCAG success criteria"; "absence of detected errors does not indicate conformance."
- **NOT defensible:** unqualified "57% coverage"; "80% automated coverage"; any claim the app "is accessible", "is WCAG AA compliant", or "passed accessibility" from automated output alone.

### What the report should show

Per finding: rule id, impact/severity, **WCAG success criterion** (axe `tags`, or parsed from the Pa11y `code`), element selector, truncated HTML snippet, `helpUrl`, and **instance count grouped by rule** (the actionable unit).

**Keep axe `incomplete` ("needs review") as a separate, equally visible bucket** — unresolved, NOT passing. Hiding it converts uncertainty into false comfort.

**Omit:** any a11y score or percentage; `inapplicable`; `passes` (at most a collapsed count); any "WCAG AA ✓" badge; anything derived from Lighthouse's numeric score.

**Proposed exact disclaimer** (always rendered above the findings table, not collapsible):

> **Automated accessibility findings only — this is not a conformance result.** These results come from automated rule checks, which detect only a subset of WCAG failures: measured against WCAG 2.1 Level AA, automated findings covered 16 of 50 success criteria, and Deque reports that automated tests found on average 57.38% of total issue instances in its audit sample. Automated tools cannot determine accessibility or conformance — knowledgeable human evaluation, including keyboard and assistive-technology testing, is required (W3C/WAI). The absence of detected errors does not mean this page is accessible or conformant. Items listed as "needs review" are undetermined, not passing.

**Traps.** Pa11y's HTML_CodeSniffer emits a WCAG-technique path while axe emits a rule slug + tags — **two non-mergeable identifier systems**; normalizing to one `rule_id` fabricates equivalence. Severity scales are not comparable (axe 4-level vs Pa11y 3-level). Instance counts inflate with page size, not badness (WebAIM: elements/page +22.5% vs errors/page +10.1%). axe `target` is an **array** (one entry per iframe level) — flattening breaks iframe/shadow-DOM findings. IBM baselines **hide regressions by design**. WAVE is credit-metered and networked — unsuitable as a default gate.

**Effort:** **Medium.** The parse is small, but a11y does not fit the per-test row model: one artifact → many findings grouped by rule, plus a second "needs review" state, source-specific severity scales, and a mandatory disclaimer block. **Large** only if we attempt cross-tool WCAG-criterion dedup — which I recommend against, since the identifier systems are not equivalent.

---

## 12. Test result aggregation standards

### JUnit XML — no official spec

Origin is the **Ant `<junit>` task** and its XML formatter. The dialect problem is documented verbatim: *"There is no official specification for the JUnit XML file format and various tools generate and support different flavors of this format"* ([testmoapp/junitxml](https://github.com/testmoapp/junitxml)).

Commonly present fields (verified against that reference):

| Element | Attributes |
|---|---|
| `<testsuites>` | `name, tests, failures, errors, skipped, assertions, time` (seconds), `timestamp` (ISO 8601) |
| `<testsuite>` | same + `file`; may nest |
| `<testcase>` | `name, classname, assertions, time, file, line` |
| result children | `<skipped message>`, `<failure message type>`, `<error message type>` |
| output | `<system-out>`, `<system-err>` (suite and case level) |
| extras | `<properties><property name value/></properties>` |

**Semantics trap:** *"A test case is considered successful (passed) unless there is another result element underneath it"* — **passing is encoded by absence**, so a truncated file silently reads as all-pass. Any parser must treat truncation as an error, not as success.

### xUnit.net XML v2 — a different format

Root `<assemblies>` (`computer, finish-rtf, id` GUID, `schema-version, start-rtf, timestamp, user`) containing `<assembly>` with `config-file, environment, errors, failed, not-run` ([xUnit.net v2 format](https://xunit.net/docs/format-xml-v2)). Note `not-run` — a state JUnit XML has no attribute for. **Detect by root tag; never feed to a JUnit parser.**

### TAP

A line protocol, not a document format. TAP 14 formalizes the grammar ([spec](https://testanything.org/tap-version-14-specification.html)), verified verbatim:

```
TAPDocument := Version Plan Body | Version Body Plan
Version     := "TAP version 14\n"
TestPoint   := ("not ")? "ok" (" " Number)? ((" -")? (" " Description))? (" " Directive)? "\n" (YAMLBlock)?
Directive   := " # " ("todo" | "skip") (" " Reason)?
```

**Limits:** no per-test duration, no file/line, no suite hierarchy except subtests, and harnesses *"must only read TAP output from standard output"* — stderr interleaving loses data. **Low value per unit of parser.**

### CTRF — is it worth adopting?

**What it claims to solve:** *"a unified JSON format for test outcomes that works across all languages and frameworks"*, enabling results to *"be shared, validated, aggregated, and analyzed consistently across tools and platforms"* ([ctrf-io/ctrf](https://github.com/ctrf-io/ctrf)).

**Schema shape** (verified from `schema/ctrf.schema.json`, draft-07): required top-level `{results, reportFormat: "CTRF", specVersion}`, plus optional `reportId`, `runId`, `timestamp`, `generatedBy`, `extra`. `results` requires `{tool: {name}, summary, tests}`. `summary` requires `tests, passed, failed, skipped, pending, other, start, stop`. Each test requires `{name, status, duration}` with optional `testId`, `suite`, `message`, `trace`, `filePath`, `rawStatus`, `tags`, `retries`, `retryAttempts[]`.

**Honest adoption assessment — verified via the GitHub API this session:**
- `ctrf-io/ctrf`: **93 stars, 4 forks**, created 2024-01-30, MIT.
- The repo states: *"We are maintaining a **pre-1.0 version** to allow for community-driven refinements before locking the v1.0.0 standard."* **The schema can still break.**
- Every reporter in the ecosystem (playwright, jest, cypress, mocha, wdio, newman, jasmine, nightwatch, go, dotnet) is published by **the same organization**.
- No OASIS/ECMA/W3C process; no independent implementations of note.

**Verdict: do NOT adopt CTRF as the internal model.** It is a single-org, pre-1.0 effort, not an industry standard — adopting it would import breaking-change risk in exchange for interoperability that does not yet exist. **But do steal its schema design**: `rawStatus` and `retryAttempts[]` solve real problems (preserving the source's own status word; representing per-attempt history) that JUnit XML and most native formats ignore entirely. Accept CTRF as an *input* format later if a user asks — that is cheap.

### Recommended internal normalized model

One flat row type with a discriminator, not two parallel report engines:

```ts
type Row = {
  kind: 'test' | 'finding'              // discriminator
  id: string                            // stable fingerprint
  tool: string; toolVersion?: string    // ← SARIF tool.driver.name/version
  suite: string[]                       // JUnit classname → ['classname']
  name: string
  status: 'passed'|'failed'|'skipped'|'pending'|'deselected'|'other'
  rawStatus?: string                    // ← CTRF: keep the source's own word
  durationMs?: number                   // JUnit @time is SECONDS — convert
  message?: string; trace?: string
  file?: string; line?: number; column?: number
  level?: 'error'|'warning'|'note'|'none'  // ← SARIF result.level (findings)
  ruleId?: string                          // findings only
  securitySeverity?: number                // CVSS 0–10, kept separate
  attempts?: number; retryAttempts?: unknown[]  // ← CTRF
  sourceFormat: string                     // warn when conversion was lossy
}
```

**Rationale for each borrowing:** the status enum comes from CTRF (the only test format that enumerates statuses normatively) **plus `deselected`** from the TIA finding above; the severity, location, and fingerprint fields come from SARIF (the only OASIS-standardized format); `suite[]` and `durationMs` cover every JUnit dialect without inheriting its ambiguity. `sourceFormat` lets the report warn when a lossy conversion happened (e.g. k6→JUnit keeps only thresholds).

---

## Prioritized recommendations

### Tier 1 — Do next (high value, low-to-medium effort)

| # | Category | Effort | Why now |
|---|---|---|---|
| 1 | **`not run (deselected)` row state + known-total denominator** | **Small** | The most dangerous dishonesty available to this tool today. A selective green run is indistinguishable from a full green run. No new parser needed. |
| 2 | **JUnit dialect hardening + multi-file merge** | **Small** | Unlocks Go (gotestsum), Rust (nextest), Java (Surefire/Gradle), PHP, Swift (SwiftPM), Cypress, WebdriverIO, Selenium **in one change**. Must handle root-`<testsuite>` vs root-`<testsuites>`, string-typed counts, one-file-per-class globbing, and rerun/flaky elements. |
| 3 | **`attempts` / "passed on retry" column + one-run honesty sentence** | **Small** | Already available from Playwright/nextest/Surefire. Correctly labeled, it is the only defensible in-run flakiness signal. |
| 4 | **SARIF 2.1.0 parser** | **Medium** | One parser unlocks Ruff, Trivy, Semgrep, Grype, osv-scanner, ESLint-via-formatter, CodeQL. The only OASIS-standardized findings format. |
| 5 | **Snapshot counts (incl. obsolete/`unchecked`)** | **Small** | The fields are already in the Jest/Vitest JSON we parse today. "12 obsolete snapshots" is free signal almost no report shows. |

### Tier 2 — Do after (clear value, real work)

| # | Category | Effort | Why |
|---|---|---|---|
| 6 | **TRX (.NET) + RSpec JSON parsers** | **Small each** | Each is one shape mapping ~1:1 onto existing rows. Watch the TRX timespan trap. |
| 7 | **Go `test -json` native NDJSON** | **Small–medium** | Richer than the gotestsum JUnit path; needed for build-failure rows that JUnit drops. |
| 8 | **Coverage summary panel (LCOV + Cobertura)** | **Medium** | Four-metric display with denominators and honest "n/a". LCOV first — it is the common denominator per Codecov. |
| 9 | **API/contract: newman JSON + oasdiff drift section** | **Medium** | Best ROI among genuinely new categories; newman maps onto existing rows, drift adds a differentiated severity-ranked section. |
| 10 | **Accessibility findings section + fixed disclaimer** | **Medium** | High user value, but only with the disclaimer, the "needs review" bucket, and **no score**. |
| 11 | **ESLint JSON + npm audit v7+** | **Small each** | Cheap once the findings row type from #4 exists. |
| 12 | **Snapshot text-diff rendering** | **Medium** | ANSI stripping, escaping, truncation. Do after counts. |

### Tier 3 — Explicitly do NOT add (YAGNI), with reasons

| Category | Why not |
|---|---|
| **CTRF as the internal model** | 93 stars, **pre-1.0 by its own statement**, single-org ecosystem. Importing breaking-change risk for interoperability that does not exist. Steal the schema ideas (`rawStatus`, `retryAttempts[]`); do not adopt the format. |
| **TAP** | No duration, no file/line, no hierarchy beyond subtests. Low value per unit of parser; producers that matter also emit JUnit. |
| **xUnit.net XML v2** | Niche outside .NET, and .NET users are better served by TRX (#6). |
| **SBOM (CycloneDX/SPDX) ingestion** | **Wrong genre** — inventory, not findings. pip-audit's own docs confirm vulnerability descriptions are not carried. Accepting one as a findings source would produce a confidently empty security section. |
| **"Selenium support" / "Puppeteer support"** | **These formats do not exist.** W3C WebDriver is a wire protocol; Puppeteer is a library. Advertising them misrepresents reality and creates support burden. Advertise the runner. |
| **Flakiness detection / scores** | Definitionally impossible from one run. Requires persisted history keyed by (test, SHA, env) — outside a single-file, no-server report. Ship `attempts` instead. |
| **Any a11y score or coverage percentage** | The 57% figure is % of *issue instances*, not coverage; 80% includes human-in-the-loop IGT. Both are indefensible as a headline. Print instance and rule counts. |
| **Lighthouse-derived a11y numbers** | The score excludes manual audits entirely and is a weighted average of binary axe-derived audits. A 100 is not evidence of accessibility. |
| **Absolute wall-clock perf gates** | Grafana's own automation guide argues against them: mismatched infra is *"unsuitable"*, comparisons must be same-environment, and gates *"may result in false assurance."* |
| **Per-line annotated coverage source** | Defeats the single-file constraint for any real codebase. genhtml and JaCoCo already do this well — link out. |
| **Raw perf sample streams (`--out json`, full JTL)** | 10⁶+ rows. Pre-aggregate at ingest or omit. |
| **Percy/Chromatic review state** | Server-side by design; structurally incompatible with a no-server file. Link only. |
| **Cross-tool WCAG-criterion dedup** | axe rule slugs and Pa11y WCAG-technique paths are **not equivalent identifier systems**; merging them fabricates equivalence. |
| **Diff/patch coverage, SARIF `baselineState`, historical trends** | All require a base reference or persisted prior runs. Each is **large** and conflicts with the self-contained premise. Revisit only if an external state file becomes acceptable. |

### Effort summary

- **Small:** deselected row state, JUnit hardening, attempts column, snapshot counts, TRX, RSpec, ESLint JSON, npm audit, k6+hyperfine threshold table.
- **Medium:** SARIF parser, coverage panel, API/contract, a11y section, Go NDJSON, snapshot text diffs, allure-results ingest, xcresult.
- **Large:** flakiness detection, patch coverage, perf distributions/baselines, any history-dependent feature.

---

## Consolidated list of unverified claims

Everything below was **not** confirmed against a primary source in this session and must not be stated as fact:

1. Third-party JUnit loggers for .NET (`JunitXml.TestLogger`) and RSpec (`rspec_junit_formatter`).
2. Complete enumeration of legal TRX `outcome` values; `--logger trx` behavior under .NET 10's Microsoft.Testing.Platform.
3. PHPUnit 10/11 deprecation status of `--log-junit`; whether `--log-otr` supersedes it; the exact attribute set PHPUnit writes into its JUnit XML.
4. Clover XML schema internals (the `--coverage-clover` flag is verified; the format's internals are not).
5. nextest's libtest-JSON field-level schema (its own docs say "Format specification: TODO").
6. Jenkins xunit-plugin per-dialect XSD contents (fetch returned an empty body).
7. Grype's current user-facing output flag spelling (format constants read from source; flag binding not).
8. Azure DevOps and VS Code SARIF-viewer consumption specifics (only GitHub's docs were fetched).
9. npm `fixAvailable` boolean form (object form verified).
10. CycloneDX VEX profile versions relevant to our inputs.
11. `newman-reporter-htmlextra` official status; Prism's result-file output.
12. Nightwatch/TestCafe reporter names.
13. Percy/Chromatic artifact formats and APIs.
14. ApprovalTests file naming; Go golden-file `-update` as any kind of standard (**it is a per-project `flag.Bool`, not a `go test` flag**).
15. Warmup as an officially prescribed load-testing practice.
16. Any normative JUnit-XML `flaky` attribute name.
17. A published quarantine-expiry policy with a specific duration.
18. IBM accessibility-checker's exact JSON report field names.
19. Share of Deque's 57.38% attributable to WCAG 4.1.1 Parsing (a criterion **removed in WCAG 2.2**).
20. Any standardized test-selection manifest format.
