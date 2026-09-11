/**
 * What a persona types, and how often it presses submit.
 *
 * A user who probes edge cases does not type the happy path: they submit an empty
 * field, paste far more text than the field expects, and include characters the
 * form was never designed for. These are the inputs a declared journey never
 * contains, so the engine generates them from the policy instead of asking the
 * author to enumerate them.
 *
 * Every value here is data handed to a field. The runner sends it and observes
 * what the page does with it; it never asserts that a vulnerability exists,
 * because whether the application neutralised the value is the finding, not the
 * premise.
 * @module @deepseek-ai/dsh-experience-runner/behavior/input
 */
import { BOUNDARY_VALUES } from "./types.js";
/**
 * Plan the inputs one declared fill action expands into.
 *
 * The declared value always runs first, so a journey's own intent is exercised
 * before the policy's probes. An empty variant replaces the declared value,
 * because appending nothing cannot clear a field; every other variant is entered
 * after clearing, so the field contains exactly the boundary value and the
 * application's reaction to it is unambiguous.
 * @param declared - the value the journey declares.
 * @param behavior - the resolved persona policy.
 * @returns the inputs to attempt, in order.
 */
export function planInputs(declared, behavior) {
    const planned = [{ kind: 'declared', value: declared, replacesDeclared: false }];
    for (const variant of behavior.input.boundaryInputs) {
        planned.push({ kind: variant.kind, value: BOUNDARY_VALUES[variant.kind], replacesDeclared: true });
    }
    return planned;
}
/**
 * Whether this behaviour fires a submit-like action twice.
 * @param behavior - the resolved persona policy.
 * @returns true when a submit is duplicated.
 */
export function duplicatesSubmit(behavior) {
    return behavior.input.doubleSubmit;
}
/**
 * Pause policy expressed in milliseconds, for a caller that paces its actions.
 * @param behavior - the resolved persona policy.
 * @returns the pause before the first action, and between later ones.
 */
export function pacingOf(behavior) {
    return { hesitateMs: behavior.timing.hesitateMs ?? 0, paceMs: behavior.timing.paceMs ?? 0 };
}
