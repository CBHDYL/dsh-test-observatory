/**
 * Rule-based experience scoring. The score is a transparent sum of weighted
 * dimensions, so a reader can always reproduce it from the recorded outcomes;
 * an AI narrative may explain a finding but never moves the number.
 * @module @deepseek-ai/dsh-experience-runner/scoring
 */

import type { CheckFinding, ExperienceRun, JourneyOutcome } from './types.ts'

/** One weighted dimension of the experience score. */
export interface ScoreDimensionSpec {
  /** Dimension label shown in the report. */
  readonly label: string
  /** Points available to this dimension. */
  readonly available: number
}

/**
 * The fixed dimension weights. Functionality dominates, then usability and the
 * feedback a user gets while waiting; polish and accessibility share the rest.
 */
export const SCORE_DIMENSIONS: readonly ScoreDimensionSpec[] = [
  { label: 'Functional completion', available: 30 },
  { label: 'Usability', available: 20 },
  { label: 'Visual quality', available: 15 },
  { label: 'Feedback & recovery', available: 15 },
  { label: 'Accessibility', available: 10 },
  { label: 'Perceived performance', available: 10 },
]

/** One scored dimension with the points it earned. */
export interface ScoreDimension {
  /** Dimension label. */
  readonly label: string
  /** Points earned. */
  readonly earned: number
  /** Points available. */
  readonly available: number
}

/** The complete rule-based score. */
export interface ExperienceScore {
  /** Total points earned across every dimension. */
  readonly total: number
  /** Qualitative band for the total. */
  readonly band: string
  /** Journeys attempted. */
  readonly tasksObserved: number
  /** Journeys whose every step passed. */
  readonly tasksCompleted: number
  /** Journeys with at least one failed or blocked step. */
  readonly blockers: number
  /** Points recoverable by fixing every failed journey. */
  readonly recoverablePoints: number
  /** Per-dimension breakdown. */
  readonly dimensions: readonly ScoreDimension[]
  /** Visual violations recorded across the run. */
  readonly visualFindings: number
  /** Accessibility violations recorded across the run. */
  readonly accessibilityFindings: number
}

/** Milliseconds above which a step counts as slow for perceived performance. */
export const SLOW_STEP_MS = 5000

/**
 * Qualitative band for a total score.
 * @param total - the score 0-100.
 * @returns the band label.
 */
export function bandFor(total: number): string {
  if (total >= 90) return 'Excellent'
  if (total >= 80) return 'Good · needs polish'
  if (total >= 60) return 'Needs work'
  return 'Blocked'
}

/**
 * Count the failed or blocked steps across every journey.
 * @param journeys - settled journeys.
 * @returns the number of unsuccessful steps.
 */
function failedSteps(journeys: readonly JourneyOutcome[]): number {
  return journeys.reduce(
    (sum, journey) => sum + journey.steps.filter(step => step.state !== 'PASS').length,
    0,
  )
}

/** Points lost per blocking visual violation. */
const VISUAL_HIGH_PENALTY = 5

/** Points lost per non-blocking visual violation. */
const VISUAL_MEDIUM_PENALTY = 2

/** Points lost per blocking accessibility violation. */
const A11Y_HIGH_PENALTY = 3

/** Points lost per non-blocking accessibility violation. */
const A11Y_MEDIUM_PENALTY = 1

/**
 * Score one run by rule. Each dimension earns its full weight minus a penalty
 * proportional to the failures that dimension can observe: functional
 * completion looks at completed journeys, usability and feedback look at how
 * steps settled, perceived performance at how long they took, and visual
 * quality and accessibility at the violations the browser checks recorded.
 * @param run - the settled run.
 * @returns the rule-based score.
 */
export function scoreRun(run: ExperienceRun): ExperienceScore {
  const journeys = run.journeys
  const tasksObserved = journeys.length
  const tasksCompleted = journeys.filter(journey => journey.passed).length
  const blockers = tasksObserved - tasksCompleted
  const failed = failedSteps(journeys)
  const totalSteps = journeys.reduce((sum, journey) => sum + journey.steps.length, 0)
  const completionRatio = tasksObserved === 0 ? 0 : tasksCompleted / tasksObserved
  const stepRatio = totalSteps === 0 ? 1 : (totalSteps - failed) / totalSteps
  const slow = journeys.reduce(
    (sum, journey) => sum + journey.steps.filter(step => step.durationMs > SLOW_STEP_MS).length,
    0,
  )
  const speedRatio = totalSteps === 0 ? 1 : (totalSteps - slow) / totalSteps
  // A defect one persona found and three personas saw is one defect.
  const dedupe = (findings: readonly CheckFinding[]): readonly CheckFinding[] => {
    const seen = new Set<string>()
    return findings.filter(finding => {
      const key = finding.rule + '|' + finding.detail
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const visualFindings = dedupe(run.checks.flatMap(entry => entry.visual))
  const a11yFindings = dedupe(run.checks.flatMap(entry => entry.accessibility))
  const visualPenalty = visualFindings.reduce(
    (sum, finding) => sum + (finding.severity === 'high' ? VISUAL_HIGH_PENALTY : VISUAL_MEDIUM_PENALTY),
    0,
  )
  const a11yPenalty = a11yFindings.reduce(
    (sum, finding) => sum + (finding.severity === 'high' ? A11Y_HIGH_PENALTY : A11Y_MEDIUM_PENALTY),
    0,
  )
  const earned: Record<string, number> = {
    'Functional completion': 30 * completionRatio,
    Usability: 20 * stepRatio,
    'Visual quality': Math.max(0, 15 - visualPenalty),
    'Feedback & recovery': 15 * stepRatio,
    Accessibility: Math.max(0, 10 - a11yPenalty),
    'Perceived performance': 10 * speedRatio,
  }
  const dimensions = SCORE_DIMENSIONS.map(spec => ({
    label: spec.label,
    earned: Math.round((earned[spec.label] as number) * 10) / 10,
    available: spec.available,
  }))
  const total = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.earned, 0))
  return {
    total,
    band: bandFor(total),
    tasksObserved,
    tasksCompleted,
    blockers,
    recoverablePoints: Math.round((100 - total) * 10) / 10,
    dimensions,
    visualFindings: visualFindings.length,
    accessibilityFindings: a11yFindings.length,
  }
}