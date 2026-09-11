/**
 * The built-in persona policies.
 *
 * Each preset states one kind of user's behaviour across every dimension. The
 * archetypes come from persona-based design testing guidance: the impatient
 * expert who skips guidance, the first-timer who reads everything, the user who
 * works without a pointer, the one who probes edge cases deliberately, and the
 * one on a phone with a poor connection. `neutral` reproduces the behaviour an
 * undeclared journey had before policies existed, so existing configurations
 * keep working unchanged.
 * @module @deepseek-ai/dsh-experience-runner/behavior/presets
 */
import type { PersonaBehavior } from './types.ts';
/** The built-in policies, keyed by preset id. */
export declare const BEHAVIOR_PRESETS: Readonly<Record<string, PersonaBehavior>>;
/** Every preset id, in report order. */
export declare const BEHAVIOR_PRESET_IDS: readonly string[];
/**
 * Resolve one preset by id.
 * @param id - the preset id.
 * @returns the preset, or undefined when no preset has that id.
 */
export declare function presetById(id: string): PersonaBehavior | undefined;
