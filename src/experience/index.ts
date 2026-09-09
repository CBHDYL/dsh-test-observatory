/**
 * Human-simulation experience runner: declared browser journeys per persona,
 * captured evidence, deterministic visual and accessibility checks, and a
 * transparent rule-based score.
 * @module @deepseek-ai/dsh-experience-runner
 */

export { DEFAULT_STEP_TIMEOUT_MS, DEFAULT_VIEWPORT, MAX_SHOT_BYTES, launchChromium, resolveExecutable, runExperience } from './runner.ts'
export type { BrowserLauncher, RunOptions } from './runner.ts'
export { checkAccessibility } from './a11y.ts'
export { checkVisual, collectViolations } from './visual.ts'
export type { VisualViolation } from './visual.ts'
export { SCORE_DIMENSIONS, SLOW_STEP_MS, bandFor, scoreRun } from './scoring.ts'
export type { ExperienceScore, ScoreDimension, ScoreDimensionSpec } from './scoring.ts'
export type * from './types.ts'
