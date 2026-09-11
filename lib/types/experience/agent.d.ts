/**
 * Drive one journey from a stated goal instead of a written script.
 *
 * A script can only confirm the path its author already imagined. A goal plus
 * an action loop can also report where the agent hesitated, what it expected to
 * find and did not, and which control it tried repeatedly without progress —
 * the observations a scripted run cannot produce, because it never tries
 * anything.
 *
 * The loop is deliberately narrow. The agent sees only the interactive
 * elements the page actually renders, chooses one action from a fixed
 * vocabulary, and states its reasoning. It cannot describe an element that is
 * not in the observation, because every action names an element by index.
 * @module @cbhdyl/dsh-test-observatory/experience/agent
 */
import type { Page } from 'playwright-core';
import type { NarrativeLlm } from '../command/narrative.ts';
/** One element the agent may act on, as the page rendered it. */
export interface ObservedElement {
    /** Index the agent uses to name this element. */
    readonly index: number;
    /** Lowercase tag name. */
    readonly tag: string;
    /** Accessible name, placeholder, or visible text, whichever the page provides. */
    readonly label: string;
    /** Whether the element accepts typed input. */
    readonly fillable: boolean;
}
/** What the agent can see at one moment. */
export interface Observation {
    /** Page title. */
    readonly title: string;
    /** Visible headings, in document order. */
    readonly headings: readonly string[];
    /** Interactive elements, in document order. */
    readonly elements: readonly ObservedElement[];
    /** Visible text length, so the agent can tell an empty screen from a full one. */
    readonly textChars: number;
    /** Current URL path. */
    readonly path: string;
}
/** The action vocabulary. Every action names an element by index, or none. */
export type AgentAction = {
    readonly kind: 'click';
    readonly index: number;
} | {
    readonly kind: 'type';
    readonly index: number;
    readonly text: string;
} | {
    readonly kind: 'back';
} | {
    readonly kind: 'done';
} | {
    readonly kind: 'stuck';
    readonly reason: string;
};
/** One turn of the loop, kept for the report. */
export interface TraceEntry {
    /** One-based turn number. */
    readonly turn: number;
    /** What the agent said it was doing and why. */
    readonly reasoning: string;
    /** The action it took, rendered for a reader. */
    readonly action: string;
    /** What happened when the action ran. */
    readonly result: string;
    /** Whether the action changed the page. */
    readonly changed: boolean;
}
/** The result of driving one journey toward its goal. */
export interface AgentRun {
    /** Whether the agent reported the goal reached. */
    readonly reached: boolean;
    /** Where the run stopped: the agent finished, ran out of budget, or got stuck. */
    readonly stopReason: 'goal-reached' | 'budget-exhausted' | 'no-progress' | 'error';
    /** Every turn, in order. */
    readonly trace: readonly TraceEntry[];
    /** What the agent said it expected and could not find. */
    readonly obstacles: readonly string[];
}
/** Longest label kept per element, so one verbose node cannot dominate the prompt. */
export declare const MAX_LABEL_CHARS = 80;
/** Elements one observation carries; a page with hundreds is not readable by a model. */
export declare const MAX_OBSERVED_ELEMENTS = 60;
/** Turns an action may repeat without changing the page before the run stops. */
export declare const NO_PROGRESS_LIMIT = 3;
/** Default turns one journey may take. */
export declare const DEFAULT_STEP_BUDGET = 15;
/**
 * Read the interactive elements the page currently renders.
 *
 * Runs inside the page and returns only what a user could act on, so the agent
 * cannot be told about an element it cannot reach.
 * @returns the current observation.
 */
export declare function observePage(): Observation;
/** The instruction that fixes the agent's output contract. */
export declare const AGENT_SYSTEM: string;
/**
 * Serialize one observation and the history into the turn prompt.
 * @param goal - the user's goal.
 * @param observation - what the page shows now.
 * @param trace - the turns already taken.
 * @returns the prompt for one decision.
 */
export declare function buildTurnPrompt(goal: string, observation: Observation, trace: readonly TraceEntry[]): string;
/**
 * Read one decision from the model's reply.
 * @param text - the model's reply.
 * @param elementCount - how many elements the observation offered.
 * @returns the parsed action and the agent's stated reasoning.
 */
export declare function parseDecision(text: string, elementCount: number): {
    reasoning: string;
    action: AgentAction;
};
/** One decision, supplied by the caller so the loop is testable without a model. */
export type Decide = (goal: string, observation: Observation, trace: readonly TraceEntry[]) => Promise<string>;
/**
 * Drive the page toward one goal until the agent finishes, runs out of turns, or
 * stops making progress.
 * @param page - the page to operate.
 * @param goal - what the user is trying to achieve.
 * @param decide - one decision per turn.
 * @param options - turn budget and an optional per-turn hook.
 * @returns the trace, the obstacles, and why the run stopped.
 */
export declare function runAgent(page: Page, goal: string, decide: Decide, options?: {
    readonly budget?: number;
    readonly onTurn?: (entry: TraceEntry, observation: Observation) => Promise<void>;
}): Promise<AgentRun>;
/**
 * Build a decision function from the harness model service.
 * @param llm - the llm service.
 * @param route - the provider and model to ask.
 * @returns a function returning one reply per turn.
 */
export declare function llmDecide(llm: NarrativeLlm, route: {
    readonly provider: string;
    readonly model: string;
}): Decide;
