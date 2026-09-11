/**
 * Persona behaviour policies.
 *
 * A persona name alone says nothing about how a task is attempted. These
 * policies state, per dimension, how one kind of user differs from another —
 * how long they wait, whether they use a pointer, what input they tolerate and
 * what conditions they run under. Every difference is a declared, reviewable
 * value, so a persona's behaviour is reproducible and testable rather than
 * implied by a label.
 *
 * What a policy is not: it does not model a person. Published research on
 * synthetic participants found that model-chosen behaviour diverges from human
 * distributions, so a policy describes which defect classes a run covers, never
 * a population.
 * @module @deepseek-ai/dsh-experience-runner/behavior/types
 */
/** Longest boundary input generated for the `veryLong` variant. */
export const VERY_LONG_LENGTH = 4096;
/** The concrete value each boundary variant substitutes. */
export const BOUNDARY_VALUES = {
    empty: '',
    whitespace: '   ',
    veryLong: 'x'.repeat(VERY_LONG_LENGTH),
    emoji: '👩‍💻🚀🏳️‍🌈',
    rtl: 'مرحبا بالعالم',
    // A benign probe: it only shows whether the application neutralises markup.
    html: '<img src=x onerror=alert(1)>',
    sqlLike: "' OR 1=1 --",
};
