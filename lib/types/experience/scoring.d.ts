/**
 * Rule-based experience scoring. The score is a transparent sum of weighted
 * dimensions, so a reader can always reproduce it from the recorded outcomes;
 * an AI narrative may explain a finding but never moves the number.
 * @module @deepseek-ai/dsh-experience-runner/scoring
 */
import type { ExperienceRun } from './types.ts';
/** One weighted dimension of the experience score. */
export interface ScoreDimensionSpec {
    /** Dimension label shown in the report. */
    readonly label: string;
    /** Points available to this dimension. */
    readonly available: number;
}
/**
 * The fixed dimension weights. Functionality dominates, then usability and the
 * feedback a user gets while waiting; polish and accessibility share the rest.
 */
export declare const SCORE_DIMENSIONS: readonly ScoreDimensionSpec[];
/** One scored dimension with the points it earned. */
export interface ScoreDimension {
    /** Dimension label. */
    readonly label: string;
    /** Points earned. */
    readonly earned: number;
    /** Points available. */
    readonly available: number;
}
/** The complete rule-based score. */
export interface ExperienceScore {
    /** Total points earned across every dimension. */
    readonly total: number;
    /** Qualitative band for the total. */
    readonly band: string;
    /** Journeys attempted. */
    readonly tasksObserved: number;
    /** Journeys whose every step passed. */
    readonly tasksCompleted: number;
    /** Journeys with at least one failed or blocked step. */
    readonly blockers: number;
    /** Points recoverable by fixing every failed journey. */
    readonly recoverablePoints: number;
    /** Per-dimension breakdown. */
    readonly dimensions: readonly ScoreDimension[];
    /** Visual violations recorded across the run. */
    readonly visualFindings: number;
    /** Accessibility violations recorded across the run. */
    readonly accessibilityFindings: number;
}
/** Milliseconds above which a step counts as slow for perceived performance. */
export declare const SLOW_STEP_MS = 5000;
/**
 * Qualitative band for a total score.
 * @param total - the score 0-100.
 * @returns the band label.
 */
export declare function bandFor(total: number): string;
/**
 * Score one run by rule. Each dimension earns its full weight minus a penalty
 * proportional to the failures that dimension can observe: functional
 * completion looks at completed journeys, usability and feedback look at how
 * steps settled, perceived performance at how long they took, and visual
 * quality and accessibility at the violations the browser checks recorded.
 * @param run - the settled run.
 * @returns the rule-based score.
 */
export declare function scoreRun(run: ExperienceRun): ExperienceScore;
