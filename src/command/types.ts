/**
 * Configuration types of the `/test` command.
 * @module @cbhdyl/dsh-test-observatory/command/types
 */

import type { JourneySpec } from '../experience/types.ts'

export type { JourneySpec }

/** Supported structured result formats emitted by test frameworks. */
export type StructuredResultFormat = 'junit' | 'vitest' | 'jest' | 'playwright' | 'pytest' | 'api' | 'performance'

/** One structured result artifact written by a declared command. */
export interface StructuredResultSpec {
  /** Parser selected for the artifact. */
  readonly format: StructuredResultFormat
  /** Artifact path, resolved from the session working directory. */
  readonly path: string
}

/** One shell-command test case declared in the suite configuration. */
export interface SuiteCase {
  /** Test case name shown in the report. */
  readonly name: string
  /** Shell command executed with `bash -c`. */
  readonly command: string
  /** Exit code that counts as a pass (default 0). */
  readonly expectedExitCode?: number
  /** Per-case timeout in milliseconds. */
  readonly timeoutMs?: number
  /** Suite the case belongs to, used for report grouping. */
  readonly suite?: string
  /** Owning team or module shown in the report. */
  readonly owner?: string
  /** Optional framework artifact that expands this command into test-level rows. */
  readonly result?: StructuredResultSpec
}

/** Report-level options of the suite configuration. */
export interface SuiteReportOptions {
  /** Report title. */
  readonly title?: string
  /** Output path of the HTML report. */
  readonly outputPath?: string
  /** Project name shown in the report header. */
  readonly project?: string
  /** History JSON path; set to false to disable history. */
  readonly historyPath?: string | false
}

/** The complete `test-observatory.yml` document. */
export interface SuiteConfig {
  /** Report options. */
  readonly report?: SuiteReportOptions
  /** Executed test cases. */
  readonly cases: readonly SuiteCase[]
  /**
   * Declared browser journeys. When present, the command also runs the
   * human-simulation pass and the report gains the experience section.
   */
  readonly journeys?: readonly JourneySpec[]
}