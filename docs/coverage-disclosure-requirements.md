# Requirement: every verdict states the limits the run did not measure

Status: accepted 2026-09-12. Owner: report quality.

## Problem

A run that measures no coverage and fails at least one test is written to disk
with no mention of the coverage gap anywhere in the document. The same run with
no failing test does mention it. The report therefore discloses one and the same
limit under `NEEDS REVIEW` and hides it under `BLOCKED`.

## Evidence

Collected from the shipped plugin on 2026-09-12.

* `coveragePercent` appears **0 times** in `src/report/assets.generated.ts`, and
  `coverage` appears **0 times** in the report script. The verdict reasons are
  the only place coverage is ever surfaced to a reader.
* A run against `/Users/bohongchen/Projects` (two declared cases, no coverage
  measurement, both cases failing) produced:

  ```json
  { "verdict": { "label": "BLOCKED",
                 "reasons": ["2 test(s) did not produce their expected exit code"] },
    "summary": { "coveragePercent": null } }
  ```

* A run against `ai-engineer-learning` (40 tests passing, no coverage
  measurement) produced six reasons, one of which reads
  `"coverage was not measured, so untested code is unknown"`.

* `src/report/selfcheck.ts` rule `unknown-coverage-not-stated` fires whenever
  `summary.coveragePercent === null` and no verdict reason contains
  `coverage`. It fires on the first run and not on the second, so the command
  reports `The report contradicts itself: unknown-coverage-not-stated.` for a
  report that is in fact internally consistent but incomplete.

* The cause is the early return in `decideRunVerdict`:

  ```ts
  if (inputs.failingTests > 0) {
    reasons.push(String(inputs.failingTests) + ' test(s) did not produce their expected exit code')
    return { verdict: 'BLOCKED', reasons }   // skips the limitations below
  }
  ```

  The two unconditional limitations (unknown coverage, no commit to compare
  against) are appended after that return, so a blocked run never carries them.

## The conflict to resolve

Two rules in this package are deliberate and currently unsatisfiable together:

* `src/experience/verdict.ts` with `tests/verdict.spec.ts` — a failing test
  outranks every other reason; the test pins `reasons` to exactly one entry.
* `src/report/selfcheck.ts` with `tests/selfcheck.spec.ts` — unmeasured
  coverage must be stated by the verdict.

They collide exactly when `failingTests > 0 && !coverageKnown`.

## Requirement

A verdict states the limits on what the run established regardless of what the
tests did. A failing test decides the verdict and is named first; it does not
make unknown coverage known, and it does not make the run comparable to a
baseline it never recorded.

The report must never disclose a limit under one verdict label and hide the same
limit under another.

## Acceptance criteria

1. `decideRunVerdict` with `failingTests > 0` and `coverageKnown: false`
   yields `BLOCKED` and a reason naming the failed tests, positioned first.
2. The same call includes `coverage was not measured, so untested code is
   unknown`.
3. The same call includes the no-commit limitation when `commit` is empty.
4. Every input whose verdict is not `BLOCKED` produces byte-identical reasons
   before and after the change.
5. `verifyReport` reports no `unknown-coverage-not-stated` violation for a
   blocked run whose coverage was not measured.
6. A blocked run whose coverage *was* measured still states no coverage
   limitation.

## Out of scope

* Measuring coverage. This requirement is about disclosing that it was not
  measured, not about producing it.
* The verdict label, the score and the confidence word. All three already treat
  a blocked run as the strongest limit and are unchanged.
* Where the other limitations are rendered. The reasons list is the only surface
  that carries coverage today; adding a second surface is a separate change.
