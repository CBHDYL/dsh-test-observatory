/**
 * Check a generated report against the claims it makes.
 *
 * Every one of these rules exists because the report once broke it: a count
 * that disagreed with the rows beneath it, a journey cleared with nothing
 * asserted, a verdict that ignored the findings on the page. A report is a
 * claim about a product, so the claim is checked before it is handed over
 * rather than after somebody acts on it.
 * @module @cbhdyl/dsh-test-observatory/report/selfcheck
 */

import type { ReportModel } from './types.ts'

/** One way a generated report contradicts itself. */
export interface SelfCheckViolation {
  /** Stable rule id. */
  readonly rule: string
  /** What the report says and what the underlying data says. */
  readonly detail: string
}

/**
 * Compare a report against its own data.
 *
 * Only contradictions between the document and the facts inside it are
 * reported. A report that establishes little is not a violation — saying so
 * plainly is the point — but a report that says two different things is.
 * @param model - the report about to be written.
 * @returns every contradiction found; an empty list means the report is coherent.
 */
export function verifyReport(model: ReportModel): readonly SelfCheckViolation[] {
  const violations: SelfCheckViolation[] = []
  const findingRows = model.tests.filter(row => row.kind === 'finding')
  const openFindings = findingRows.filter(row => row.status === 'failed')

  if (model.summary.findings !== openFindings.length) {
    violations.push({
      rule: 'finding-count-disagrees-with-rows',
      detail: 'the summary reports ' + String(model.summary.findings) + ' finding(s) while ' + String(openFindings.length) + ' row(s) are reported open',
    })
  }

  for (const journey of model.journeys ?? []) {
    if (journey.verdict === 'PASS' && (journey.assertions ?? 0) === 0) {
      violations.push({
        rule: 'journey-cleared-without-an-assertion',
        detail: 'journey ' + JSON.stringify(journey.name) + ' is reported PASS with no assertion behind it',
      })
    }
  }

  const high = (model.checks ?? []).filter(check => check.severity === 'high')
  if (high.length > 0 && model.verdict.label === 'READY') {
    violations.push({
      rule: 'verdict-cleared-with-open-blockers',
      detail: 'the verdict is READY while ' + String(high.length) + ' blocking finding(s) are open',
    })
  }
  if (high.length > 0 && (model.verdict.reasons ?? []).every(reason => !reason.includes('blocking'))) {
    violations.push({
      rule: 'blockers-absent-from-the-reasons',
      detail: 'the verdict does not name the ' + String(high.length) + ' blocking finding(s) behind it',
    })
  }

  const keyboardBlockers = (model.checks ?? []).filter(check => check.family === 'keyboard' && check.severity === 'high')
  if (keyboardBlockers.length > 0) {
    for (const journey of model.journeys ?? []) {
      if (journey.verdict !== 'PASS') continue
      if (journey.name.includes('键盘') === false && (journey.verdictReasons ?? []).every(reason => !reason.includes('keyboard'))) continue
      violations.push({
        rule: 'keyboard-journey-cleared-against-blocking-findings',
        detail: 'journey ' + JSON.stringify(journey.name) + ' is reported PASS while a blocking keyboard finding is open',
      })
    }
  }

  if ((model.meta.commit ?? '').length === 0 && (model.trend ?? []).length > 0) {
    violations.push({
      rule: 'trend-without-a-comparable-run',
      detail: 'the report shows ' + String((model.trend ?? []).length) + ' earlier run(s) while the run records no commit to compare against',
    })
  }

  if (model.summary.coveragePercent === null && (model.verdict.reasons ?? []).every(reason => !reason.includes('coverage'))) {
    violations.push({
      rule: 'unknown-coverage-not-stated',
      detail: 'coverage was not measured and the verdict does not say so',
    })
  }

  for (const shot of model.evidence ?? []) {
    // A picture that cannot be placed in a run is a picture, not evidence.
    if (shot.provenance === undefined || shot.provenance.artifactHash.length === 0) {
      violations.push({
        rule: 'evidence-without-provenance',
        detail: 'capture ' + JSON.stringify(shot.id) + ' carries no run, time or content hash to trace it by',
      })
    }
    if (!(shot.imageDataUri ?? '').startsWith('data:image/')) {
      violations.push({
        rule: 'evidence-not-self-contained',
        detail: 'capture ' + JSON.stringify(shot.id) + ' does not carry its image inline, so the report is not a single file',
      })
    }
  }

  return violations
}
