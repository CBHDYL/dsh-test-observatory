/**
 * Map a settled human-simulation run into the report model's experience
 * section: score, persona cards, journey rails, evidence gallery and findings.
 * @module @cbhdyl/dsh-test-observatory/command/experience
 */

import { findDuplicateEvidence, guidanceFor, scoreRun } from '../experience/index.ts'
import { decideJourneyVerdict } from '../experience/verdict.ts'
import type { VerdictFinding } from '../experience/verdict.ts'
import type { CheckFinding as RunCheckFinding, ExperienceRun, JourneyOutcome, RuleGuidance } from '../experience/index.ts'
import type { CheckFinding, EvidenceShot, ExperienceScore, FindingEvidence, Journey, Persona, UxFinding } from '../report/index.ts'

/**
 * The requirement and fix shown beside one finding: this package's own
 * catalogue first, then whatever the producer stated about the rule.
 * @param finding - one check finding.
 * @returns the fields the report renders beside the finding.
 */
function checkGuidance(finding: RunCheckFinding): RuleGuidance | undefined {
  const known = guidanceFor(finding.rule)
  const requirement = known?.requirement ?? finding.requirement
  const helpUrl = known?.helpUrl ?? finding.helpUrl
  if (requirement === undefined) return undefined
  const fix = known?.fix ?? 'Follow the linked rule documentation for the elements listed below.'
  return { requirement, fix, ...(helpUrl === undefined ? {} : { helpUrl }) }
}

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
    evidenceIds: journey.steps.find(step => step.label === label)?.evidenceIds ?? [],
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
    behaviorId: journey.behavior.id,
    ...(journey.behaviorDimensions.length === 0 ? {} : { behaviorDimensions: journey.behaviorDimensions }),
  }))
  // A journey verdict consumes the findings measured on this run, so a page a
  // keyboard journey visited cannot report success while a blocking keyboard
  // finding stands against it.
  const verdictFindings: VerdictFinding[] = run.checks.flatMap(group => [
    ...group.visual.map(check => ({ severity: check.severity, family: 'visual' as const, persona: group.persona })),
    ...group.accessibility.map(check => ({ severity: check.severity, family: 'accessibility' as const, persona: group.persona })),
    ...group.keyboard.map(check => ({ severity: check.severity, family: 'keyboard' as const, persona: group.persona })),
  ])
  const journeys: Journey[] = run.journeys.map(journey => {
    const decision = decideJourneyVerdict({
      persona: journey.persona,
      stepsPassed: journey.passed,
      assertions: journey.assertions,
      agentDriven: journey.stopReason !== undefined,
      keyboard: journey.behavior.modality.pointer === false,
    }, verdictFindings)
    return {
    personaId: personaId(journey.persona),
    name: journey.name,
    assertions: journey.assertions,
    verdict: decision.verdict,
    verdictReasons: [...decision.reasons],
    steps: journey.steps.map((step, index) => ({
      label: step.label,
      state: step.state,
      seconds: step.state === 'BLOCKED' ? null : Math.round(step.durationMs / 10) / 100,
      ...(step.error === undefined ? {} : { error: step.error }),
      ...(step.evidenceIds === undefined ? {} : { evidenceIds: step.evidenceIds }),
      ...(journey.trace?.[index] === undefined ? {} : { reasoning: journey.trace[index].reasoning, result: journey.trace[index].result, changed: journey.trace[index].changed }),
    })),
    ...(journey.stopReason === undefined ? {} : { stopReason: journey.stopReason }),
    ...(journey.obstacles === undefined ? {} : { obstacles: journey.obstacles }),
    }
  })
  // Two journeys that open the same page capture the same bytes; the report
  // must say so rather than present one observation as several.
  const duplicateOf = new Map(findDuplicateEvidence(run.shots.map(shot => ({ id: shot.id, imageDataUri: shot.dataUri }))).map((entry): [string, string] => [entry.id, entry.firstId]))
  const evidence: EvidenceShot[] = run.shots.map(shot => ({
    id: shot.id,
    title: shot.caption,
    personaId: personaId(shot.persona),
    journey: shot.journey,
    stepLabel: shot.stepLabel,
    kind: shot.category,
    meta: shot.meta,
    imageDataUri: shot.dataUri,
    ...(shot.annotatedDataUri === undefined ? {} : { annotatedImageDataUri: shot.annotatedDataUri }),
    ...(shot.integrityDefects === undefined ? {} : { integrityDefects: shot.integrityDefects }),
    ...(duplicateOf.has(shot.id)
      ? { integrityDefects: [...(shot.integrityDefects ?? []), { rule: 'evidence-duplicate', detail: 'this capture is byte-identical to ' + String(duplicateOf.get(shot.id)) + ', so it is one observation shown twice' }] }
      : {}),
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
    for (const [family, findings] of [['visual', entry.visual], ['accessibility', entry.accessibility], ['keyboard', entry.keyboard]] as const) {
      for (const finding of findings) {
        const key = family + '|' + finding.rule + '|' + finding.detail
        if (seen.has(key)) continue
        seen.add(key)
        const measured = finding.evidence ?? []
        const evidence: readonly FindingEvidence[] = measured.map(entryEvidence => ({
          tag: entryEvidence.element.tag,
          selector: entryEvidence.element.selector,
          ...(entryEvidence.element.text === undefined ? {} : { text: entryEvidence.element.text }),
          box: entryEvidence.box,
        }))
        checks.push({
          rule: finding.rule,
          detail: finding.detail,
          ...checkGuidance(finding),
          severity: finding.severity,
          family,
          persona: entry.persona,
          ...(evidence.length === 0 ? {} : { evidence }),
          ...(finding.cropDataUri === undefined ? {} : { cropDataUri: finding.cropDataUri }),
        })
      }
    }
  }
  return { experience: score, personas, journeys, evidence, findings, checks }
}
