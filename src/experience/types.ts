/**
 * Human-simulation experience model: the personas, journeys, evidence and
 * findings one browser run produces, plus the rule-based scoring inputs.
 * Every field is JSON-compatible so a report can embed the model directly.
 * @module @deepseek-ai/dsh-experience-runner/types
 */

import type { CaptureDefect } from './integrity.ts'

/** One declared browser interaction inside a journey step. */
export type JourneyAction =
  | { readonly kind: 'goto'; readonly url: string }
  | { readonly kind: 'click'; readonly selector: string }
  | { readonly kind: 'fill'; readonly selector: string; readonly value: string }
  | { readonly kind: 'expectText'; readonly text: string }
  | { readonly kind: 'expectVisible'; readonly selector: string }
  | { readonly kind: 'wait'; readonly ms?: number; readonly selector?: string }
  | { readonly kind: 'screenshot'; readonly caption: string; readonly category: 'key' | 'fail' | 'mobile' | 'final' }

/** One step of a declared journey: a label plus the actions it performs. */
export interface JourneyStepSpec {
  /** Step label shown in the report. */
  readonly label: string
  /** Actions executed in order; the step fails at the first failure. */
  readonly actions: readonly JourneyAction[]
  /** Per-step deadline in milliseconds. */
  readonly timeoutMs?: number
}

/** One persona's declared task. */
export interface JourneySpec {
  /** Persona display name, also the report's persona label. */
  readonly persona: string
  /** Device and environment description shown on the persona card. */
  readonly device: string
  /** Journey title. */
  readonly name: string
  /** Viewport this journey runs in. */
  readonly viewport?: { readonly width: number; readonly height: number }
  /** Ordered steps. */
  readonly steps: readonly JourneyStepSpec[]
}

/** One captured screenshot, carried as a data URI so the report stays a single file. */
export interface CapturedShot {
  /** Stable capture id referenced by steps and findings. */
  readonly id: string
  /** Caption shown under the thumbnail. */
  readonly caption: string
  /** Gallery category. */
  readonly category: 'key' | 'fail' | 'mobile' | 'final'
  /** Persona that produced the capture. */
  readonly persona: string
  /** Journey that produced the capture. */
  readonly journey: string
  /** Step active when the capture was taken. */
  readonly stepLabel: string
  /** Device, step and viewport description. */
  readonly meta: string
  /** A data:image/png;base64 payload. */
  readonly dataUri: string
  /**
   * The same page state with the findings marked, when a region could be
   * measured. Absent means no mark applies to this capture, not that marking
   * failed.
   */
  readonly annotatedDataUri?: string
  /**
   * Integrity defects found in this capture. Any entry means the image must be
   * shown as untrusted: an unverifiable screenshot looks identical to a correct
   * one, so the reader has to be told.
   */
  readonly integrityDefects?: readonly CaptureDefect[]
}

/** One settled step outcome. */
export interface StepOutcome {
  /** Step label. */
  readonly label: string
  /** Settled state. */
  readonly state: 'PASS' | 'FAIL' | 'BLOCKED'
  /** Observed duration in milliseconds. */
  readonly durationMs: number
  /** Failure explanation, absent when the step passed. */
  readonly error?: string
  /** Captures recorded during this step. */
  readonly evidenceIds?: readonly string[]
}

/** One settled journey outcome. */
export interface JourneyOutcome {
  /** Persona display name. */
  readonly persona: string
  /** Device description. */
  readonly device: string
  /** Journey title. */
  readonly name: string
  /** Settled steps, in declaration order. */
  readonly steps: readonly StepOutcome[]
  /** Whether every step passed. */
  readonly passed: boolean
}

/** One check finding recorded against a journey. */
export interface CheckFinding {
  /** Stable rule id. */
  readonly rule: string
  /** What was observed. */
  readonly detail: string
  /** Whether the finding blocks a user task. */
  readonly severity: 'high' | 'medium'
}

/** The checks recorded for one journey. */
export interface JourneyChecks {
  /** Persona the checks ran for. */
  readonly persona: string
  /** Deterministic visual violations. */
  readonly visual: readonly CheckFinding[]
  /** Accessibility violations. */
  readonly accessibility: readonly CheckFinding[]
}

/** The complete result of one human-simulation run. */
export interface ExperienceRun {
  /** Settled journeys. */
  readonly journeys: readonly JourneyOutcome[]
  /** Captured screenshots, in capture order. */
  readonly shots: readonly CapturedShot[]
  /** Visual and accessibility checks, one entry per journey that ran them. */
  readonly checks: readonly JourneyChecks[]
}