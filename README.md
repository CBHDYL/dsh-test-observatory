# dsh-test-observatory

Test Observatory for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): run a declared test suite, drive real browser journeys per persona, and get one self-contained HTML report you can send to anyone.

Two entry points mount into a profile:

- **`/test`** — the human command. Reads `test-observatory.yml`, runs the declared shell cases, optionally drives the declared browser journeys, and writes the report.
- **`run_tests`** — the model-facing tool. The agent declares shell-command cases and gets the same report.

## Install

```sh
dsh plugin --profile web add @cbhdyl/dsh-test-observatory
```

Restart `dsh web`, then type `/test` in a session.

## Configure

Create `test-observatory.yml` in the session working directory:

```yaml
report:
  title: Release candidate
  project: Atlas Shop
  outputPath: reports/test-observatory.html
cases:
  - name: Unit tests
    command: pnpm run test
    suite: Unit
    owner: Platform
    timeoutMs: 600000
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

Commands:

```text
/test                     run ./test-observatory.yml
/test path/to/suite.yml   run the named configuration
/test auto                detect the project and print a declaration to paste
```

## Browser

Journeys need a Chromium. The plugin uses `playwright-core`, which does not download a browser; set `DSH_BROWSER_EXECUTABLE` when none is found:

```sh
export DSH_BROWSER_EXECUTABLE=/path/to/chrome
```

Without a browser the journey pass fails loudly instead of reporting a false pass.

## The report

One HTML file, no external resources, opens from disk:

- executive quality score, verdict and risk summary
- pass rate, duration, coverage and failure counts
- quality trajectory, failure causes, slowest tests, runtime timeline
- new regressions and recovered tests
- rule-based **experience score** across six weighted dimensions
- persona cards, journey rails with per-step timings, screenshot gallery
- deterministic **visual checks** (broken images, missing alt, overflow, placeholder-only fields)
- **axe-core accessibility scan** with each violation listed
- UX findings separating browser fact from AI interpretation

## Experience score

| Dimension | Weight | Measured by |
|---|---:|---|
| Functional completion | 30 | journeys whose every step passed |
| Usability | 20 | steps that settled successfully |
| Visual quality | 15 | visual violations (−5 blocking, −2 otherwise) |
| Feedback & recovery | 15 | steps that settled successfully |
| Accessibility | 10 | axe violations (−3 blocking, −1 otherwise) |
| Perceived performance | 10 | steps under 5s |

Violations are deduplicated by rule and observation, so one page defect seen by three personas costs once.

## Known limitations

- Visual quality covers five objective rules, not aesthetics: spacing, alignment and hierarchy are not measured.
- Journeys run sequentially in one browser, with optional per-step retries.
- Screenshots are embedded as data URIs; a capture over 400 KB is re-encoded and finally dropped if still too large.
- The trajectory chart has one point per run; historical comparison needs earlier runs supplied by a producer.

## License

MIT
