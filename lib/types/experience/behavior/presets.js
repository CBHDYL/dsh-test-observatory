/** The policy an undeclared journey uses: pointer, patient, no substitutions. */
const NEUTRAL = {
    id: 'neutral',
    summary: 'Declared steps replayed with default timing and a pointer.',
    input: { boundaryInputs: [], doubleSubmit: false },
    timing: { settleBudgetMs: 20_000, waitForIdle: true },
    modality: { pointer: true, tabBudget: 40 },
    environment: {},
    recovery: { retries: 0, alternativePaths: [] },
};
/** The built-in policies, keyed by preset id. */
export const BEHAVIOR_PRESETS = {
    neutral: NEUTRAL,
    // Reads everything, waits for the page to settle, and still uses a pointer.
    'first-time': {
        id: 'first-time',
        summary: 'Waits for the page to settle fully and reads before acting.',
        input: { boundaryInputs: [], doubleSubmit: false, typeDelayMs: 60 },
        timing: { settleBudgetMs: 20_000, waitForIdle: true, hesitateMs: 400 },
        modality: { pointer: true, tabBudget: 40 },
        environment: {},
        recovery: { retries: 0, alternativePaths: [] },
    },
    // Skips the patience entirely and looks for the escape hatch first.
    expert: {
        id: 'expert',
        summary: 'Acts immediately, never waits for idle, and dismisses overlays.',
        input: { boundaryInputs: [], doubleSubmit: false },
        timing: { settleBudgetMs: 1_500, waitForIdle: false },
        modality: { pointer: true, tabBudget: 25 },
        environment: {},
        recovery: { retries: 0, alternativePaths: ['pressEscape'] },
    },
    // Works without a pointer at all.
    keyboard: {
        id: 'keyboard',
        summary: 'Reaches every target with Tab and activates with the keyboard.',
        input: { boundaryInputs: [], doubleSubmit: false },
        timing: { settleBudgetMs: 20_000, waitForIdle: true },
        modality: { pointer: false, tabBudget: 60 },
        environment: {},
        recovery: { retries: 0, alternativePaths: ['pressEscape'] },
    },
    // Deliberately probes the edges instead of the happy path.
    'error-prone': {
        id: 'error-prone',
        summary: 'Submits boundary input and interrupts the flow to see whether state survives.',
        input: {
            boundaryInputs: [
                { kind: 'empty' },
                { kind: 'veryLong' },
                { kind: 'emoji' },
                { kind: 'rtl' },
                { kind: 'html' },
            ],
            doubleSubmit: false,
        },
        timing: { settleBudgetMs: 20_000, waitForIdle: true },
        modality: { pointer: true, tabBudget: 40 },
        environment: {},
        recovery: { retries: 1, alternativePaths: ['reload'] },
    },
    // One-handed, interrupted, often on a poor connection.
    mobile: {
        id: 'mobile',
        summary: 'Runs on a slow connection and must cope with being interrupted.',
        input: { boundaryInputs: [], doubleSubmit: false },
        timing: { settleBudgetMs: 30_000, waitForIdle: true, paceMs: 150 },
        modality: { pointer: true, tabBudget: 50 },
        environment: { network: 'slow3g', cpuThrottle: 4 },
        recovery: { retries: 1, alternativePaths: ['reload'] },
    },
    // Does not wait for anything and submits twice.
    impatient: {
        id: 'impatient',
        summary: 'Never waits for the page and fires submit-like actions twice.',
        input: { boundaryInputs: [], doubleSubmit: true },
        timing: { settleBudgetMs: 750, waitForIdle: false },
        modality: { pointer: true, tabBudget: 30 },
        environment: {},
        recovery: { retries: 0, alternativePaths: [] },
    },
};
/** Every preset id, in report order. */
export const BEHAVIOR_PRESET_IDS = Object.keys(BEHAVIOR_PRESETS);
/**
 * Resolve one preset by id.
 * @param id - the preset id.
 * @returns the preset, or undefined when no preset has that id.
 */
export function presetById(id) {
    return BEHAVIOR_PRESETS[id];
}
