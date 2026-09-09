/**
 * Map a settled human-simulation run into the report model's experience
 * section: score, persona cards, journey rails, evidence gallery and findings.
 * @module @deepseek-ai/dsh-command-test/experience
 */
import type { ExperienceRun } from '../experience/index.ts';
import type { CheckFinding, EvidenceShot, ExperienceScore, Journey, Persona, UxFinding } from '../report/index.ts';
/** The experience section of the report model. */
export interface ExperienceSection {
    /** Rule-based score. */
    readonly experience: ExperienceScore;
    /** Persona cards. */
    readonly personas: readonly Persona[];
    /** Journey rails. */
    readonly journeys: readonly Journey[];
    /** Evidence gallery. */
    readonly evidence: readonly EvidenceShot[];
    /** Findings derived from the failed steps. */
    readonly findings: readonly UxFinding[];
    /** Recorded visual and accessibility violations. */
    readonly checks: readonly CheckFinding[];
}
/**
 * Map a settled run into the report's experience section.
 * @param run - the settled human-simulation run.
 * @returns the section, ready to spread into the report model.
 */
export declare function toExperienceSection(run: ExperienceRun): ExperienceSection;
