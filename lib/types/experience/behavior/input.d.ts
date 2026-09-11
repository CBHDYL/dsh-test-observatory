import type { InputVariant, PersonaBehavior } from './types.ts';
/** One input the engine will attempt, with the value it carries. */
export interface PlannedInput {
    /** Variant name, recorded on any finding it produces. */
    readonly kind: InputVariant;
    /** The value to enter. */
    readonly value: string;
    /**
     * Whether this replaces the declared value rather than following it. An empty
     * variant replaces, because a field that already holds text cannot be emptied
     * by typing after it.
     */
    readonly replacesDeclared: boolean;
}
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
export declare function planInputs(declared: string, behavior: PersonaBehavior): readonly PlannedInput[];
/**
 * Whether this behaviour fires a submit-like action twice.
 * @param behavior - the resolved persona policy.
 * @returns true when a submit is duplicated.
 */
export declare function duplicatesSubmit(behavior: PersonaBehavior): boolean;
/**
 * Pause policy expressed in milliseconds, for a caller that paces its actions.
 * @param behavior - the resolved persona policy.
 * @returns the pause before the first action, and between later ones.
 */
export declare function pacingOf(behavior: PersonaBehavior): {
    readonly hesitateMs: number;
    readonly paceMs: number;
};
