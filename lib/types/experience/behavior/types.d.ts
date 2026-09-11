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
/**
 * The variant names an input can carry. `declared` marks the value the journey
 * itself supplied, so it is never confused with the `empty` boundary variant.
 */
export type InputVariant = 'declared' | 'empty' | 'whitespace' | 'veryLong' | 'emoji' | 'rtl' | 'html' | 'sqlLike';
/** One boundary input a policy may substitute for declared text. */
export interface BoundaryInput {
    /** Variant name, recorded on any finding it produces. */
    readonly kind: Exclude<InputVariant, 'declared'>;
}
/** How much and what kind of input a persona produces. */
export interface InputPolicy {
    /** Boundary variants tried after the declared value, in order. */
    readonly boundaryInputs: readonly BoundaryInput[];
    /** Whether a submit-like action is fired twice in quick succession. */
    readonly doubleSubmit: boolean;
    /** Delay between keystrokes, so typing is not instantaneous. */
    readonly typeDelayMs?: number;
}
/** How long a persona waits and how deliberately it moves. */
export interface TimingPolicy {
    /** Deadline for the best-effort wait for network idle, in milliseconds. */
    readonly settleBudgetMs: number;
    /** Whether to wait for network idle at all before acting. */
    readonly waitForIdle: boolean;
    /** Pause before a pointer action, in milliseconds. */
    readonly hesitateMs?: number;
    /** Pause between actions, in milliseconds. */
    readonly paceMs?: number;
}
/** How a persona operates the interface. */
export interface ModalityPolicy {
    /** Whether a pointer may be used; when false, every interaction is keyboard-driven. */
    readonly pointer: boolean;
    /** Upper bound on Tab presses used to reach a target before it counts as unreachable. */
    readonly tabBudget: number;
}
/** Conditions a persona runs under. */
export interface EnvironmentPolicy {
    /** Network profile applied through the browser's own emulation. */
    readonly network?: 'offline' | 'slow3g' | 'fast3g' | 'slow4g';
    /** CPU slowdown multiplier, applied through the browser's own emulation. */
    readonly cpuThrottle?: number;
}
/** Alternative actions a persona tries when a step fails. */
export interface RecoveryPolicy {
    /** Extra attempts of the whole step after the first failure. */
    readonly retries: number;
    /** Widely usable escape hatches tried between attempts, in order. */
    readonly alternativePaths: readonly ('pressEscape' | 'reload' | 'goBack' | 'dismissDialog')[];
}
/** One persona's complete behaviour. */
export interface PersonaBehavior {
    /** Stable id, such as `impatient`. */
    readonly id: string;
    /** One-line statement of what this policy covers, for the report. */
    readonly summary: string;
    /** Input behaviour. */
    readonly input: InputPolicy;
    /** Timing behaviour. */
    readonly timing: TimingPolicy;
    /** Interaction modality. */
    readonly modality: ModalityPolicy;
    /** Runtime conditions. */
    readonly environment: EnvironmentPolicy;
    /** Failure recovery. */
    readonly recovery: RecoveryPolicy;
}
/** A partial override merged over a preset. */
export interface BehaviorOverride {
    /** Preset to start from. */
    readonly preset: string;
    /** Replacement input policy. */
    readonly input?: Partial<InputPolicy>;
    /** Replacement timing policy. */
    readonly timing?: Partial<TimingPolicy>;
    /** Replacement modality policy. */
    readonly modality?: Partial<ModalityPolicy>;
    /** Replacement environment policy. */
    readonly environment?: Partial<EnvironmentPolicy>;
    /** Replacement recovery policy. */
    readonly recovery?: Partial<RecoveryPolicy>;
}
/** Longest boundary input generated for the `veryLong` variant. */
export declare const VERY_LONG_LENGTH = 4096;
/** The concrete value each boundary variant substitutes. */
export declare const BOUNDARY_VALUES: Readonly<Record<BoundaryInput['kind'], string>>;
