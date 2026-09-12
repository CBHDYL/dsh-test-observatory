/**
 * Decide what a journey and a run actually established.
 *
 * A journey that ran every step has not necessarily proved anything: opening a
 * page asserts nothing, and a model saying it reached a goal is a request to be
 * believed, not a verification. A run that passed its tests has not necessarily
 * cleared the product: an open high finding is by definition something no test
 * covered. This module derives both verdicts from what was recorded, so no
 * score, percentage or model sentence can stand in for evidence.
 * @module @cbhdyl/dsh-test-observatory/experience/verdict
 */

/** What one journey established. */
export type JourneyVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE'

/** What the run as a whole established. */
export type RunVerdict = 'BLOCKED' | 'NEEDS REVIEW' | 'READY'

/** One finding the run recorded, reduced to what a verdict needs. */
export interface VerdictFinding {
  /** Whether the finding blocks a user task. */
  readonly severity: 'high' | 'medium'
  /** Check family the finding belongs to. */
  readonly family: 'visual' | 'accessibility' | 'keyboard'
  /** Persona whose journey visited the page the finding was measured on. */
  readonly persona: string
}

/** One journey, reduced to what a verdict needs. */
export interface VerdictJourney {
  /** Persona display name. */
  readonly persona: string
  /** Whether every declared step settled. */
  readonly stepsPassed: boolean
  /**
   * Successful assertions the journey made: a step that compared what the page
   * shows against what was declared. Opening a page asserts nothing.
   */
  readonly assertions: number
  /** Whether the model chose the actions rather than a written path. */
  readonly agentDriven: boolean
  /** Whether this journey was driven with the keyboard. */
  readonly keyboard: boolean
}

/** One verdict and the facts it rests on. */
export interface VerdictResult<T> {
  /** The verdict. */
  readonly verdict: T
  /** Every fact that produced it, in the order they were considered. */
  readonly reasons: readonly string[]
}

/**
 * Decide what one journey established.
 *
 * A failed step is a failure. A journey that asserted nothing is inconclusive
 * however many steps it ran, because running a path is not checking an outcome.
 * An agent-driven journey is inconclusive by construction: the model reports
 * that it believes the goal was reached, which is a claim and not a check.
 * A high keyboard finding on a page the journey visited fails a keyboard
 * journey, because the journey exists to establish that a keyboard user can
 * operate the page.
 * @param journey - the journey, reduced to verdict inputs.
 * @param findings - every finding the run recorded.
 * @returns the verdict and the facts behind it.
 */
export function decideJourneyVerdict(journey: VerdictJourney, findings: readonly VerdictFinding[]): VerdictResult<JourneyVerdict> {
  const reasons: string[] = []
  if (!journey.stepsPassed) {
    reasons.push('a declared step did not settle')
    return { verdict: 'FAIL', reasons }
  }
  // Whether focus is visible is a property of the application, not of the
  // persona that happened to visit it: every journey reaches the same pages, so
  // a blocking keyboard finding anywhere in the run contradicts any keyboard
  // journey reporting success.
  const keyboardBlockers = findings.filter(finding => finding.family === 'keyboard' && finding.severity === 'high')
  if (journey.keyboard && keyboardBlockers.length > 0) {
    reasons.push('this run recorded ' + String(keyboardBlockers.length) + ' blocking keyboard finding(s), so a keyboard user cannot operate the page')
    return { verdict: 'FAIL', reasons }
  }
  if (journey.agentDriven) {
    reasons.push('the model reported the goal reached; nothing independently checked the result')
    return { verdict: 'INCONCLUSIVE', reasons }
  }
  if (journey.assertions === 0) {
    reasons.push('every step settled but no step asserted an outcome, so the journey only shows the page loaded')
    return { verdict: 'INCONCLUSIVE', reasons }
  }
  reasons.push(String(journey.assertions) + ' assertion(s) held')
  return { verdict: 'PASS', reasons }
}

/** Everything the run verdict is decided from. */
export interface RunVerdictInputs {
  /** Journeys with their own verdicts. */
  readonly journeys: readonly { readonly verdict: JourneyVerdict; readonly persona: string }[]
  /** Every finding the run recorded. */
  readonly findings: readonly VerdictFinding[]
  /** Tests that did not produce their expected exit code. */
  readonly failingTests: number
  /** Whether the run measured coverage. */
  readonly coverageKnown: boolean
  /** The commit the run tested, empty when the run did not record one. */
  readonly commit: string
}

/**
 * Decide what the run established.
 *
 * A failing test blocks release. Any other limitation — an open high finding, an
 * inconclusive journey, unknown coverage, a run with no commit to compare
 * against — caps the verdict at needs review, because each of them means
 * something the run did not establish. Only a run that failed nothing, asserted
 * its journeys, cleared its findings and knows its commit is ready.
 * @param inputs - everything the verdict is decided from.
 * @returns the verdict and every fact behind it.
 */
export function decideRunVerdict(inputs: RunVerdictInputs): VerdictResult<RunVerdict> {
  const reasons: string[] = []
  // What the run did not establish does not become established because a test
  // failed, and every other verdict names these. A blocked run names them too,
  // or the same gap is disclosed under one verdict and hidden under another.
  const limitations: string[] = []
  if (!inputs.coverageKnown) limitations.push('coverage was not measured, so untested code is unknown')
  if (inputs.commit.length === 0) limitations.push('the run recorded no commit, so it cannot be compared with a baseline')

  if (inputs.failingTests > 0) {
    reasons.push(String(inputs.failingTests) + ' test(s) did not produce their expected exit code')
    reasons.push(...limitations)
    return { verdict: 'BLOCKED', reasons }
  }
  reasons.push('no executed test failed')

  const high = inputs.findings.filter(finding => finding.severity === 'high')
  if (high.length > 0) reasons.push(String(high.length) + ' open blocking finding(s) that no test covers')

  const inconclusive = inputs.journeys.filter(journey => journey.verdict === 'INCONCLUSIVE')
  if (inconclusive.length > 0) reasons.push(String(inconclusive.length) + ' journey(s) settled without establishing anything: ' + inconclusive.map(journey => journey.persona).join(', '))

  const failed = inputs.journeys.filter(journey => journey.verdict === 'FAIL')
  if (failed.length > 0) reasons.push(String(failed.length) + ' journey(s) failed: ' + failed.map(journey => journey.persona).join(', '))

  reasons.push(...limitations)

  const capped = high.length > 0 || inconclusive.length > 0 || failed.length > 0 || !inputs.coverageKnown || inputs.commit.length === 0
  if (capped) return { verdict: 'NEEDS REVIEW', reasons }
  reasons.push('every journey asserted an outcome, every finding is clear and the run is comparable')
  return { verdict: 'READY', reasons }
}

/**
 * The confidence word a reader sees beside the verdict.
 * @param inputs - the run verdict inputs.
 * @returns the string "high" only when nothing limits what the run established.
 */
export function confidenceOf(inputs: RunVerdictInputs): 'high' | 'limited' {
  const high = inputs.findings.some(finding => finding.severity === 'high')
  const inconclusive = inputs.journeys.some(journey => journey.verdict === 'INCONCLUSIVE')
  return !high && !inconclusive && inputs.coverageKnown && inputs.commit.length > 0 ? 'high' : 'limited'
}
