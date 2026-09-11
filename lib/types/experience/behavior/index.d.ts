import type { BehaviorOverride, PersonaBehavior } from './types.ts';
export type { BehaviorOverride, BoundaryInput, EnvironmentPolicy, InputPolicy, ModalityPolicy, PersonaBehavior, RecoveryPolicy, TimingPolicy } from './types.ts';
export { BOUNDARY_VALUES, VERY_LONG_LENGTH } from './types.ts';
export { BEHAVIOR_PRESETS, BEHAVIOR_PRESET_IDS, presetById } from './presets.ts';
/** The policy used when a journey declares no behaviour at all. */
export declare const DEFAULT_BEHAVIOR: PersonaBehavior;
/**
 * Resolve a declared behaviour into a complete policy.
 * @param declared - a preset id, or a preset plus overrides, or undefined.
 * @returns the complete policy.
 * @throws when the declaration names a preset that does not exist.
 */
export declare function resolveBehavior(declared: string | BehaviorOverride | undefined): PersonaBehavior;
/**
 * The dimensions a policy changes relative to {@link DEFAULT_BEHAVIOR}, for the
 * report's persona card.
 * @param behavior - the resolved policy.
 * @returns short labels naming each changed dimension.
 */
export declare function behaviorDimensions(behavior: PersonaBehavior): readonly string[];
