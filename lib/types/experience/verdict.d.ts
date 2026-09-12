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
export type JourneyVerdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';
/** What the run as a whole established. */
export type RunVerdict = 'BLOCKED' | 'NEEDS REVIEW' | 'READY';
/** One finding the run recorded, reduced to what a verdict needs. */
export interface VerdictFinding {
    /** Whether the finding blocks a user task. */
    readonly severity: 'high' | 'medium';
    /** Check family the finding belongs to. */
    readonly family: 'visual' | 'accessibility' | 'keyboard';
    /** Persona whose journey visited the page the finding was measured on. */
    readonly persona: string;
}
/** One journey, reduced to what a verdict needs. */
export interface VerdictJourney {
    /** Persona display name. */
    readonly persona: string;
    /** Whether every declared step settled. */
    readonly stepsPassed: boolean;
    /**
     * Successful assertions the journey made: a step that compared what the page
     * shows against what was declared. Opening a page asserts nothing.
     */
    readonly assertions: number;
    /** Whether the model chose the actions rather than a written path. */
    readonly agentDriven: boolean;
    /** Whether this journey was driven with the keyboard. */
    readonly keyboard: boolean;
}
/** One verdict and the facts it rests on. */
export interface VerdictResult<T> {
    /** The verdict. */
    readonly verdict: T;
    /** Every fact that produced it, in the order they were considered. */
    readonly reasons: readonly string[];
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
export declare function decideJourneyVerdict(journey: VerdictJourney, findings: readonly VerdictFinding[]): VerdictResult<JourneyVerdict>;
/** Everything the run verdict is decided from. */
export interface RunVerdictInputs {
    /** Journeys with their own verdicts. */
    readonly journeys: readonly {
        readonly verdict: JourneyVerdict;
        readonly persona: string;
    }[];
    /** Every finding the run recorded. */
    readonly findings: readonly VerdictFinding[];
    /** Tests that did not produce their expected exit code. */
    readonly failingTests: number;
    /** Whether the run measured coverage. */
    readonly coverageKnown: boolean;
    /** The commit the run tested, empty when the run did not record one. */
    readonly commit: string;
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
export declare function decideRunVerdict(inputs: RunVerdictInputs): VerdictResult<RunVerdict>;
/**
 * The confidence word a reader sees beside the verdict.
 * @param inputs - the run verdict inputs.
 * @returns the string "high" only when nothing limits what the run established.
 */
export declare function confidenceOf(inputs: RunVerdictInputs): 'high' | 'limited';
