/**
 * Element references and viewport geometry for a finding. Both checks record
 * where a defect was observed, so the report can mark the exact region of a
 * screenshot instead of only naming it in prose.
 *
 * The shapes are plain data so a serialized in-page function can return them.
 * @module @deepseek-ai/dsh-experience-runner/geometry
 */
/** Longest visible-text excerpt kept on an element reference. */
export const MAX_ELEMENT_TEXT = 80;
