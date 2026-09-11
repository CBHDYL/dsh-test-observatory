/**
 * Resolving a declared persona behaviour into the concrete policy a run uses.
 *
 * A configuration names either a preset or a preset plus overrides. Resolution
 * is explicit and fails loudly on an unknown preset, because a typo that
 * silently fell back to `neutral` would make a persona claim behaviour it does
 * not have.
 * @module @deepseek-ai/dsh-experience-runner/behavior
 */
import { BEHAVIOR_PRESETS, presetById } from "./presets.js";
export { BOUNDARY_VALUES, VERY_LONG_LENGTH } from "./types.js";
export { BEHAVIOR_PRESETS, BEHAVIOR_PRESET_IDS, presetById } from "./presets.js";
/** The policy used when a journey declares no behaviour at all. */
export const DEFAULT_BEHAVIOR = BEHAVIOR_PRESETS['neutral'];
/**
 * Resolve a declared behaviour into a complete policy.
 * @param declared - a preset id, or a preset plus overrides, or undefined.
 * @returns the complete policy.
 * @throws when the declaration names a preset that does not exist.
 */
export function resolveBehavior(declared) {
    if (declared === undefined)
        return DEFAULT_BEHAVIOR;
    if (typeof declared === 'string') {
        const preset = presetById(declared);
        if (preset === undefined) {
            throw new Error('unknown persona behaviour "' + declared + '"; known presets: ' + Object.keys(BEHAVIOR_PRESETS).join(', '));
        }
        return preset;
    }
    const preset = presetById(declared.preset);
    if (preset === undefined) {
        throw new Error('unknown persona behaviour "' + declared.preset + '"; known presets: ' + Object.keys(BEHAVIOR_PRESETS).join(', '));
    }
    return {
        id: preset.id,
        summary: declared.input === undefined && declared.timing === undefined && declared.modality === undefined
            && declared.environment === undefined && declared.recovery === undefined
            ? preset.summary
            : preset.summary + ' (overridden)',
        input: { ...preset.input, ...declared.input },
        timing: { ...preset.timing, ...declared.timing },
        modality: { ...preset.modality, ...declared.modality },
        environment: { ...preset.environment, ...declared.environment },
        recovery: { ...preset.recovery, ...declared.recovery },
    };
}
/**
 * The dimensions a policy changes relative to {@link DEFAULT_BEHAVIOR}, for the
 * report's persona card.
 * @param behavior - the resolved policy.
 * @returns short labels naming each changed dimension.
 */
export function behaviorDimensions(behavior) {
    const labels = [];
    if (!behavior.modality.pointer)
        labels.push('keyboard-only');
    if (behavior.input.boundaryInputs.length > 0)
        labels.push('boundary-input');
    if (behavior.input.doubleSubmit)
        labels.push('double-submit');
    if (!behavior.timing.waitForIdle)
        labels.push('no-settle');
    if (behavior.timing.hesitateMs !== undefined)
        labels.push('hesitant');
    if (behavior.timing.paceMs !== undefined)
        labels.push('paced');
    if (behavior.environment.network !== undefined)
        labels.push(behavior.environment.network);
    if (behavior.environment.cpuThrottle !== undefined)
        labels.push('cpu×' + String(behavior.environment.cpuThrottle));
    if (behavior.recovery.retries > 0)
        labels.push('retries');
    if (behavior.recovery.alternativePaths.length > 0)
        labels.push('recovery-paths');
    return labels;
}
