/**
 * Report data model of the Test Observatory HTML report: the complete set of
 * facts one rendered report can show. Every field is JSON-compatible so the
 * renderer can embed the whole model into the document without transformation.
 *
 * @module @deepseek-ai/dsh-report-observatory/types
 */

/** Outcome of one executed test case. */
export type TestStatus = 'passed' | 'failed' | 'flaky' | 'skipped'

/** One executed test case, as shown in the report table. */
export interface ReportTest {
  /** Test case name shown as the row title. */
  readonly name: string
  /** Repository-relative path or identifier shown under the name. */
  readonly path: string
  /** Settled outcome. */
  readonly status: TestStatus
  /** Suite the case belongs to. */
  readonly suite: string
  /** Duration in seconds. */
  readonly durationSeconds: number
  /** Owning team or module. */
  readonly owner: string
}

/** One root-cause cluster of failures. */
export interface FailureCause {
  /** Human-readable cause label. */
  readonly label: string
  /** Number of failures attributed to this cause. */
  readonly count: number
}

/** One entry of the slowest-test ranking. */
export interface SlowTest {
  /** Rank position, 1-based. */
  readonly rank: number
  /** Test case name. */
  readonly name: string
  /** Suite the case belongs to. */
  readonly suite: string
  /** Duration in seconds. */
  readonly durationSeconds: number
}

/** One parallel lane of the runtime timeline. */
export interface TimelineLane {
  /** Suite or lane name. */
  readonly label: string
  /** Lane start offset in seconds from run start. */
  readonly startSeconds: number
  /** Lane duration in seconds. */
  readonly durationSeconds: number
}

/** One newly introduced regression. */
export interface Regression {
  /** Test case name. */
  readonly name: string
  /** Owning area and team. */
  readonly scope: string
  /** Severity label. */
  readonly severity: string
}

/** One test that started passing consistently again. */
export interface RecoveredTest {
  /** Test case name. */
  readonly name: string
  /** Evidence sentence describing the recovery. */
  readonly evidence: string
}

/** One point of the historical quality trend. */
export interface TrendPoint {
  /** Run label, such as a run id. */
  readonly run: string
  /** Quality score 0-100. */
  readonly score: number
  /** Duration in seconds, scaled into the same chart band. */
  readonly durationSeconds: number
}

/** One human behavior model simulated against the product. */
export interface Persona {
  /** Stable identifier referenced by journeys and evidence. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Device and environment summary. */
  readonly device: string
  /** Number of tasks attempted. */
  readonly tasks: number
  /** Percentage of tasks completed. */
  readonly completionPercent: number
  /** One-line summary of the dominant finding. */
  readonly headline: string
}

/** One step of a persona journey. */
export interface JourneyStep {
  /** Step label. */
  readonly label: string
  /** Settled step state. */
  readonly state: 'PASS' | 'FAIL' | 'BLOCKED'
  /** Observed duration in seconds, or null when the step never ran. */
  readonly seconds: number | null
}

/** One simulated task performed by a persona. */
export interface Journey {
  /** Persona id this journey belongs to. */
  readonly personaId: string
  /** Journey title. */
  readonly name: string
  /** Ordered observed steps. */
  readonly steps: readonly JourneyStep[]
}

/** One captured screenshot referenced by the report. */
export interface EvidenceShot {
  /** Caption shown under the thumbnail. */
  readonly title: string
  /** Persona id that produced the capture. */
  readonly personaId: string
  /** Capture category used by the gallery filter. */
  readonly kind: 'key' | 'fail' | 'mobile' | 'final'
  /** Device, step and viewport description. */
  readonly meta: string
  /**
   * Real capture as a `data:image/png;base64,...` payload. When absent the
   * gallery draws its illustrative miniature instead.
   */
  readonly imageDataUri?: string
}

/** One recorded visual or accessibility violation. */
export interface CheckFinding {
  /** Stable rule id, such as `image-broken` or `axe:color-contrast`. */
  readonly rule: string
  /** What was observed. */
  readonly detail: string
  /** Whether the finding blocks a user task. */
  readonly severity: 'high' | 'medium'
  /** Check family the finding belongs to. */
  readonly family: 'visual' | 'accessibility'
  /** Persona the check ran for. */
  readonly persona: string
}

/** One user-experience finding. */
export interface UxFinding {
  /** Stable identifier. */
  readonly id: string
  /** Severity label. */
  readonly severity: string
  /** Scored dimension the finding belongs to. */
  readonly dimension: string
  /** Points deducted from the experience score. */
  readonly deductedPoints: number
  /** Finding title. */
  readonly title: string
  /** Observed fact summary. */
  readonly observation: string
  /** Page and persona scope line. */
  readonly scope: string
  /** Points recoverable by fixing the finding. */
  readonly recoverablePoints: number
}

/** Rule-based experience score with its transparent dimension breakdown. */
export interface ExperienceScore {
  /** Total score 0-100. */
  readonly total: number
  /** Qualitative band label. */
  readonly band: string
  /** Tasks attempted across every persona. */
  readonly tasksObserved: number
  /** Tasks completed. */
  readonly tasksCompleted: number
  /** High-severity blockers found. */
  readonly blockers: number
  /** Points recoverable by fixing every finding. */
  readonly recoverablePoints: number
  /** One scored dimension of the total. */
  readonly dimensions: readonly ScoreDimension[]
}

/** One scored dimension of the experience score. */
export interface ScoreDimension {
  /** Dimension label. */
  readonly label: string
  /** Points earned. */
  readonly earned: number
  /** Points available. */
  readonly available: number
}

/** Aggregate counts of one run. */
export interface ReportSummary {
  /** Total number of test cases. */
  readonly total: number
  /** Passed test cases. */
  readonly passed: number
  /** Failed test cases. */
  readonly failed: number
  /** Skipped test cases. */
  readonly skipped: number
  /** Flaky test cases. */
  readonly flaky: number
  /** Wall-clock duration in seconds. */
  readonly durationSeconds: number
  /** Line coverage percentage, or null when not measured. */
  readonly coveragePercent: number | null
}

/** Run identity shown in the report header. */
export interface RunMeta {
  /** Project name. */
  readonly project: string
  /** Branch name. */
  readonly branch: string
  /** Commit identifier. */
  readonly commit: string
  /** Environment label. */
  readonly environment: string
  /** Run timestamp, already formatted for display. */
  readonly runAt: string
  /** Run identifier shown in the eyebrow line. */
  readonly runId: string
}

/** Executive verdict shown in the hero. */
export interface Verdict {
  /** Quality score 0-100. */
  readonly score: number
  /** Release recommendation headline shown as the hero title. */
  readonly headline: string
  /** Short verdict label shown beside the status pulse. */
  readonly label: string
  /** Supporting sentence under the headline. */
  readonly summary: string
  /** Confidence statement, such as a percentage. */
  readonly confidence: string
  /** AI risk summary sentence. */
  readonly risk: string
}

/** One headline metric card. */
export interface Kpi {
  /** Metric label. */
  readonly label: string
  /** Formatted metric value. */
  readonly value: string
  /** Comparison line under the value. */
  readonly delta: string
  /** Whether the delta is a regression. */
  readonly worse?: boolean
}

/** The complete data model of one rendered report. */
export interface ReportModel {
  /** Run identity. */
  readonly meta: RunMeta
  /** Executive verdict. */
  readonly verdict: Verdict
  /** Headline metrics. */
  readonly kpis: readonly Kpi[]
  /** Aggregate counts. */
  readonly summary: ReportSummary
  /** Historical trend points, oldest first. */
  readonly trend: readonly TrendPoint[]
  /** Root-cause clusters. */
  readonly causes: readonly FailureCause[]
  /** Slowest tests, already ranked. */
  readonly slowest: readonly SlowTest[]
  /** Parallel lanes of the runtime timeline. */
  readonly timeline: readonly TimelineLane[]
  /** Newly introduced regressions. */
  readonly regressions: readonly Regression[]
  /** Consistently passing again. */
  readonly recovered: readonly RecoveredTest[]
  /**
   * Rule-based experience score, or absent when no human-simulation run was
   * performed. The whole experience section is omitted from the document when
   * this is absent, so a command-only run renders an automation report.
   */
  readonly experience?: ExperienceScore
  /** Simulated behavior models. Absent with `experience`. */
  readonly personas?: readonly Persona[]
  /** Simulated tasks. Absent with `experience`. */
  readonly journeys?: readonly Journey[]
  /** Captured screenshots. Absent with `experience`. */
  readonly evidence?: readonly EvidenceShot[]
  /** User-experience findings. Absent with `experience`. */
  readonly findings?: readonly UxFinding[]
  /** Deterministic visual and accessibility violations. Absent with `experience`. */
  readonly checks?: readonly CheckFinding[]
  /** Executed test cases. */
  readonly tests: readonly ReportTest[]
}
