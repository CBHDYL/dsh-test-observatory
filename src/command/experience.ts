/**
 * Map a settled human-simulation run into the report model's experience
 * section: score, persona cards, journey rails, evidence gallery and findings.
 * @module @deepseek-ai/dsh-command-test/experience
 */

import { scoreRun } from '../experience/index.ts'
import type { ExperienceRun, JourneyOutcome } from '../experience/index.ts'
import type { CheckFinding, EvidenceShot, ExperienceScore, Journey, Persona, UxFinding } from '../report/index.ts'

/** The experience section of the report model. */
export interface ExperienceSection {
  /** Rule-based score. */
  readonly experience: ExperienceScore
  /** Persona cards. */
  readonly personas: readonly Persona[]
  /** Journey rails. */
  readonly journeys: readonly Journey[]
  /** Evidence gallery. */
  readonly evidence: readonly EvidenceShot[]
  /** Findings derived from the failed steps. */
  readonly findings: readonly UxFinding[]
  /** Recorded visual and accessibility violations. */
  readonly checks: readonly CheckFinding[]
}

/**
 * Build a stable persona id from a display name. Unicode letters and digits are
 * kept, so a non-Latin persona name stays distinct instead of collapsing onto
 * the same fallback id as every other non-Latin name.
 * @param name - the persona display name.
 * @returns a lowercase slug usable as a data attribute.
 */
export function personaId(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'persona'
}

/**
 * Turn one failed step into a finding.
 * @param journey - the journey that owns the step.
 * @param label - the failed step label.
 * @param error - the observed failure message.
 * @param index - position, used for the finding id.
 * @returns the finding.
 */
function toFinding(journey: JourneyOutcome, label: string, error: string, index: number): UxFinding {
  return {
    id: 'finding-' + String(index + 1),
    severity: 'HIGH',
    dimension: 'Feedback & recovery',
    deductedPoints: 2,
    title: label + ' failed for ' + journey.persona,
    observation: error,
    scope: journey.name + ' · ' + journey.persona,
    recoverablePoints: 2,
  }
}

/**
 * Map a settled run into the report's experience section.
 * @param run - the settled human-simulation run.
 * @returns the section, ready to spread into the report model.
 */
export function toExperienceSection(run: ExperienceRun): ExperienceSection {
  const score = scoreRun(run)
  const personas = run.journeys.map(journey => ({
    id: personaId(journey.persona),
    name: journey.persona,
    device: journey.device,
    tasks: journey.steps.length,
    completionPercent: journey.steps.length === 0
      ? 0
      : Math.round((journey.steps.filter(step => step.state === 'PASS').length / journey.steps.length) * 100),
    headline: journey.passed ? 'Completed' : 'Blocked',
  }))
  const journeys: Journey[] = run.journeys.map(journey => ({
    personaId: personaId(journey.persona),
    name: journey.name,
    steps: journey.steps.map(step => ({
      label: step.label,
      state: step.state,
      seconds: step.state === 'BLOCKED' ? null : Math.round(step.durationMs / 10) / 100,
    })),
  }))
  const evidence: EvidenceShot[] = run.shots.map(shot => ({
    title: shot.caption,
    personaId: personaId(shot.persona),
    kind: shot.category,
    meta: shot.meta,
    imageDataUri: shot.dataUri,
  }))
  const findings = run.journeys.flatMap((journey, journeyIndex) =>
    journey.steps
      .filter(step => step.state === 'FAIL')
      .map((step, stepIndex) => toFinding(journey, step.label, step.error ?? 'step did not settle', journeyIndex * 100 + stepIndex)),
  )
  // One page defect found by three personas is one defect: dedupe by rule and
  // detail, keeping the first persona that observed it.
  const seen = new Set<string>()
  const checks: CheckFinding[] = []
  for (const entry of run.checks) {
    for (const [family, findings] of [['visual', entry.visual], ['accessibility', entry.accessibility]] as const) {
      for (const finding of findings) {
        const key = family + '|' + finding.rule + '|' + finding.detail
        if (seen.has(key)) continue
        seen.add(key)
        checks.push({ ...finding, family, persona: entry.persona })
      }
    }
  }
  return { experience: score, personas, journeys, evidence, findings, checks }
}