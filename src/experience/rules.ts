/**
 * What each deterministic check rule requires and how a page satisfies it.
 *
 * A finding that only names a rule tells a reader that something is wrong and
 * nothing about what to change. Every rule this package emits therefore has one
 * entry here, and an axe rule either has one too or carries axe's own
 * description and documentation link, so no finding reaches the report without
 * a stated requirement.
 * @module @cbhdyl/dsh-test-observatory/experience/rules
 */

/** What one rule requires and how a page satisfies it. */
export interface RuleGuidance {
  /** The requirement the rule checks, stated as what must hold. */
  readonly requirement: string
  /** The change that satisfies it, phrased against the observed evidence. */
  readonly fix: string
  /** Authoritative page documenting the rule, when one exists. */
  readonly helpUrl?: string
}

/** Guidance for the rules this package emits, keyed by rule id. */
const RULES: Readonly<Record<string, RuleGuidance>> = {
  'image-broken': {
    requirement: 'Every image the page requests must load.',
    fix: 'Fix the src URL, or remove the image if it is no longer served.',
  },
  'image-no-alt': {
    requirement: 'Every informative image must carry a text alternative.',
    fix: 'Add an alt attribute describing the image, or alt="" when it is decorative.',
  },
  'horizontal-overflow': {
    requirement: 'The page must not scroll sideways at the tested viewport.',
    fix: 'Constrain the element that exceeds the viewport with max-width, or let it wrap.',
  },
  'element-outside-viewport': {
    requirement: 'Content a user needs must be reachable inside the viewport.',
    fix: 'Move the element into the visible area, or make its container scrollable.',
  },
  'placeholder-only-field': {
    requirement: 'A field must be labelled by something that survives typing.',
    fix: 'Add a <label for> or aria-label; a placeholder disappears as soon as the user types.',
  },
  'page-checks-skipped': {
    requirement: 'Deterministic checks must run against the page.',
    fix: 'Inspect why the page could not be inspected; the checks did not evaluate it.',
  },
  'keyboard-focus-not-visible': {
    requirement: 'A keyboard user must be able to see where focus is.',
    fix: 'Give the focused element a visible outline; do not remove it without a replacement.',
  },
  'keyboard-dialog-present': {
    requirement: 'A dialog must not open without the keyboard user being able to leave it.',
    fix: 'Ensure the dialog can be dismissed with Escape and returns focus to its opener.',
  },
  'keyboard-focus-trap-missing': {
    requirement: 'Focus must stay inside an open modal dialog.',
    fix: 'Trap Tab and Shift+Tab within the dialog while it is open.',
  },
  'keyboard-escape-ignored': {
    requirement: 'Escape must close an open dialog.',
    fix: 'Handle Escape on the dialog and restore focus to the element that opened it.',
  },
  'evidence-too-small': {
    requirement: 'Captured evidence must contain the page it claims to show.',
    fix: 'Re-run the journey; this capture is a recording defect, not a product defect.',
  },
  'evidence-overlay-left-behind': {
    requirement: 'Annotation must not outlive the screenshot it annotates.',
    fix: 'Re-run the journey; the annotation overlay leaked into the page.',
  },
  'evidence-annotation-missing': {
    requirement: 'A finding shown in the report must be marked on its own screenshot.',
    fix: 'Re-run the journey; the annotation step did not mark the evidence.',
  },
  'evidence-annotation-not-visible': {
    requirement: 'The annotation on a screenshot must be visible in the image.',
    fix: 'Re-run the journey; the annotation rendered outside the captured area.',
  },
  'evidence-size-mismatch': {
    requirement: 'A screenshot must match the viewport it was captured at.',
    fix: 'Re-run the journey; this capture does not match its declared viewport.',
  },
}

/**
 * The axe rules the report explains itself, keyed by the bare axe id. A rule
 * absent here still reaches the report with axe's own description and link.
 */
const AXE_RULES: Readonly<Record<string, RuleGuidance>> = {
  'color-contrast': {
    requirement: 'Text must be readable against its background.',
    fix: 'Darken the text or lighten its background until the measured ratio passes 4.5:1 for body text.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
  },
  'image-alt': {
    requirement: 'Every informative image must carry a text alternative.',
    fix: 'Add a descriptive alt attribute, or alt="" for a purely decorative image.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
  },
  'page-has-heading-one': {
    requirement: 'A page must name its main subject with one level-one heading.',
    fix: 'Mark the visible page title as <h1>, and keep exactly one on the page.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/page-has-heading-one',
  },
  'aria-progressbar-name': {
    requirement: 'A progress bar must have an accessible name.',
    fix: 'Add aria-label to the element carrying role="progressbar".',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-progressbar-name',
  },
  'button-name': {
    requirement: 'A button must have an accessible name.',
    fix: 'Add text, aria-label, or a labelled icon inside the button.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
  },
  'label': {
    requirement: 'Every form field must have an accessible name.',
    fix: 'Associate a <label for> or add aria-label to the input.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
  },
  'html-has-lang': {
    requirement: 'The document must declare its language.',
    fix: 'Add a lang attribute to <html>, for example lang="en".',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/html-has-lang',
  },
  'link-name': {
    requirement: 'A link must have an accessible name describing its destination.',
    fix: 'Add link text or aria-label; "click here" is not a name.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
  },
  'landmark-one-main': {
    requirement: 'The page must expose one main landmark.',
    fix: 'Wrap the primary content in <main>.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/landmark-one-main',
  },
  'region': {
    requirement: 'All page content must sit inside a landmark region.',
    fix: 'Wrap the content in <main>, <nav>, <header>, <footer>, or an equivalent role.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/region',
  },
}

/**
 * The guidance for one reported rule.
 * @param rule - the rule id as it appears in the report.
 * @returns the guidance, or undefined when the rule carries its own description.
 */
export function guidanceFor(rule: string): RuleGuidance | undefined {
  if (rule.startsWith('axe:')) return AXE_RULES[rule.slice(4)]
  return RULES[rule]
}

/**
 * The guidance for one axe violation, preferring this package's own wording and
 * falling back to the description axe reported with the violation.
 * @param id - the bare axe rule id.
 * @param description - axe's own description of what the rule checks.
 * @param helpUrl - axe's documentation link for the rule.
 * @returns the guidance shown beside the finding.
 */
export function axeGuidance(id: string, description: string, helpUrl: string | undefined): RuleGuidance {
  const known = AXE_RULES[id]
  if (known !== undefined) {
    return helpUrl === undefined || known.helpUrl !== undefined ? known : { ...known, helpUrl }
  }
  return {
    requirement: description,
    fix: 'Follow the rule documentation for the elements listed below.',
    ...(helpUrl === undefined ? {} : { helpUrl }),
  }
}
