/**
 * Human-simulation experience runner: declared browser journeys per persona,
 * captured evidence, deterministic visual and accessibility checks, and a
 * transparent rule-based score.
 * @module @deepseek-ai/dsh-experience-runner
 */
export { DEFAULT_STEP_TIMEOUT_MS, DEFAULT_VIEWPORT, MAX_SHOT_BYTES, launchChromium, resolveExecutable, runExperience } from "./runner.js";
export { checkAccessibility } from "./a11y.js";
export { checkVisual, collectViolations } from "./visual.js";
export { SCORE_DIMENSIONS, SLOW_STEP_MS, bandFor, scoreRun } from "./scoring.js";
