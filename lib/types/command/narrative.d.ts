/**
 * Model-written interpretation of the facts one run captured.
 *
 * The model reads a bounded digest of what the browser and the test runners
 * already recorded and returns prose about it. It cannot add a fact: every
 * interpretation is keyed to a finding the run produced, and an interpretation
 * for a rule the run did not report is discarded. A run without a configured
 * model route carries no narrative at all, and the report says so by omitting
 * the section rather than by filling it with a template.
 * @module @cbhdyl/dsh-test-observatory/command/narrative
 */
import type { ReportModel } from '../report/types.ts';
/** One model call the narrative layer needs. */
export interface NarrativeRequest {
    /** Instruction that fixes the output contract and forbids invention. */
    readonly system: string;
    /** The run's recorded facts, serialized. */
    readonly prompt: string;
    /** Caller-owned cancellation. */
    readonly signal: AbortSignal;
}
/**
 * Produce narrative text for one run. The writer owns the model route; the
 * narrative layer owns what may be asked and what may be accepted.
 */
export type NarrativeWriter = (request: NarrativeRequest) => Promise<string>;
/** One finding's interpretation, keyed to the rule the run reported. */
export interface FindingNarrative {
    /** Rule id the interpretation belongs to, exactly as the run reported it. */
    readonly rule: string;
    /** What the recorded evidence means for a user. */
    readonly interpretation: string;
    /** What to change, phrased against the recorded elements. */
    readonly nextAction: string;
}
/** The complete accepted narrative for one run. */
export interface RunNarrative {
    /** One sentence a manager can act on, grounded in the run's own numbers. */
    readonly risk: string;
    /** Per-finding interpretation, in any order. */
    readonly findings: readonly FindingNarrative[];
}
/** Findings the digest carries, so a noisy scan cannot grow the request without bound. */
export declare const DIGEST_FINDING_LIMIT = 40;
/**
 * The instruction for one narrative call. It states the output contract, the
 * grounding rule, and the refusal the model must use instead of inventing.
 */
export declare const NARRATIVE_SYSTEM: string;
/** The subset of the harness `llm` service the narrative call uses. */
export interface NarrativeLlm {
    stream(options: {
        provider: string;
        model: string;
        system: string;
        messages: readonly {
            readonly role: 'user';
            readonly content: readonly {
                readonly type: 'text';
                readonly text: string;
            }[];
        }[];
        signal: AbortSignal;
    }): AsyncIterable<{
        readonly type: string;
        readonly text?: string;
    }>;
}
/**
 * Build a writer that asks the run's declared route for the narrative. Only
 * text deltas are read; reasoning and tool-call deltas are not narrative.
 * @param llm - the harness llm service.
 * @param route - the provider and model the run declared.
 * @returns the writer the command calls.
 */
export declare function llmNarrativeWriter(llm: NarrativeLlm, route: {
    readonly provider: string;
    readonly model: string;
}): NarrativeWriter;
/**
 * Serialize the run's recorded facts for one narrative call. Only facts the
 * report already shows are included, so the model can never learn more than the
 * reader does.
 * @param model - the report model the run produced.
 * @returns the JSON digest the model receives.
 */
export declare function buildNarrativePrompt(model: ReportModel): string;
/**
 * Parse one model reply into the accepted narrative. The reply must be a JSON
 * object carrying a non-empty `risk`; anything else is a contract violation the
 * caller reports rather than a narrative it half-applies.
 * @param text - the model's reply.
 * @returns the parsed narrative.
 * @throws when the reply is not the contracted JSON object.
 */
export declare function parseRunNarrative(text: string): RunNarrative;
/**
 * Merge an accepted narrative into the report. An interpretation is attached
 * only to a finding whose rule the run reported, so the model cannot introduce
 * a finding that did not happen.
 * @param model - the report model to annotate.
 * @param narrative - the accepted narrative.
 * @returns the annotated model.
 */
export declare function applyNarrative(model: ReportModel, narrative: RunNarrative): ReportModel;
