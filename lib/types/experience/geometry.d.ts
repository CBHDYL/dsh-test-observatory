/**
 * Element references and viewport geometry for a finding. Both checks record
 * where a defect was observed, so the report can mark the exact region of a
 * screenshot instead of only naming it in prose.
 *
 * The shapes are plain data so a serialized in-page function can return them.
 * @module @deepseek-ai/dsh-experience-runner/geometry
 */
/** Coordinate space a {@link ElementBox} is expressed in. */
export type BoxSpace = 'viewport' | 'fullPage';
/** One measured rectangle. */
export interface ElementBox {
    /** Left edge in CSS pixels. */
    readonly x: number;
    /** Top edge in CSS pixels. */
    readonly y: number;
    /** Width in CSS pixels. */
    readonly width: number;
    /** Height in CSS pixels. */
    readonly height: number;
    /** The space the coordinates belong to, so a consumer never mixes them. */
    readonly space: BoxSpace;
}
/** One element a finding points at. */
export interface ElementRef {
    /** Lowercase tag name. */
    readonly tag: string;
    /** A stable CSS path usable in a report and by a debugging selector. */
    readonly selector: string;
    /** Visible text, collapsed and truncated for display. */
    readonly text?: string;
}
/** A finding's target: what it points at and where that was on screen. */
export interface ElementEvidence {
    /** The element the finding describes. */
    readonly element: ElementRef;
    /** The element's measured rectangle. */
    readonly box: ElementBox;
}
/** Longest visible-text excerpt kept on an element reference. */
export declare const MAX_ELEMENT_TEXT = 80;
