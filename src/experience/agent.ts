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
import type { Page } from 'playwright-core'
import type { NarrativeLlm } from '../command/narrative.ts'
import { ensurePageHelpers } from './in-page.ts'

/** One element the agent may act on, as the page rendered it. */
export interface ObservedElement {
  /** Index the agent uses to name this element. */
  readonly index: number
  /** Lowercase tag name. */
  readonly tag: string
  /** Accessible name, placeholder, or visible text, whichever the page provides. */
  readonly label: string
  /** Whether the element accepts typed input. */
  readonly fillable: boolean
}

/** What the agent can see at one moment. */
export interface Observation {
  /** Page title. */
  readonly title: string
  /** Visible headings, in document order. */
  readonly headings: readonly string[]
  /** Interactive elements, in document order. */
  readonly elements: readonly ObservedElement[]
  /** Visible text length, so the agent can tell an empty screen from a full one. */
  readonly textChars: number
  /** Current URL path. */
  readonly path: string
}

/** The action vocabulary. Every action names an element by index, or none. */
export type AgentAction =
  | { readonly kind: 'click'; readonly index: number }
  | { readonly kind: 'type'; readonly index: number; readonly text: string }
  | { readonly kind: 'back' }
  | { readonly kind: 'done' }
  | { readonly kind: 'stuck'; readonly reason: string }

/** One turn of the loop, kept for the report. */
export interface TraceEntry {
  /** One-based turn number. */
  readonly turn: number
  /** What the agent said it was doing and why. */
  readonly reasoning: string
  /** The action it took, rendered for a reader. */
  readonly action: string
  /** What happened when the action ran. */
  readonly result: string
  /** Whether the action changed the page. */
  readonly changed: boolean
}

/** The result of driving one journey toward its goal. */
export interface AgentRun {
  /** Whether the agent reported the goal reached. */
  readonly reached: boolean
  /** Where the run stopped: the agent finished, ran out of budget, or got stuck. */
  readonly stopReason: 'goal-reached' | 'budget-exhausted' | 'no-progress' | 'error'
  /** Every turn, in order. */
  readonly trace: readonly TraceEntry[]
  /** What the agent said it expected and could not find. */
  readonly obstacles: readonly string[]
}

/** Longest label kept per element, so one verbose node cannot dominate the prompt. */
export const MAX_LABEL_CHARS = 80
/** Elements one observation carries; a page with hundreds is not readable by a model. */
export const MAX_OBSERVED_ELEMENTS = 60
/** Turns an action may repeat without changing the page before the run stops. */
export const NO_PROGRESS_LIMIT = 3
/** Default turns one journey may take. */
export const DEFAULT_STEP_BUDGET = 15

/**
 * Read the interactive elements the page currently renders.
 *
 * Runs inside the page and returns only what a user could act on, so the agent
 * cannot be told about an element it cannot reach.
 * @returns the current observation.
 */
export function observePage(): Observation {
  const limit = 80
  const isVisible = (element: Element): boolean => {
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const labelOf = (element: Element): string => {
    const aria = element.getAttribute('aria-label')
    if (aria !== null && aria.trim().length > 0) return aria.trim()
    const own = (element.textContent ?? '').replace(/\s+/gu, ' ').trim()
    if (own.length > 0) return own
    const placeholder = element.getAttribute('placeholder')
    if (placeholder !== null && placeholder.trim().length > 0) return placeholder.trim()
    const title = element.getAttribute('title')
    if (title !== null && title.trim().length > 0) return title.trim()
    const name = element.getAttribute('name')
    return name === null ? '' : name
  }
  const selector = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]'
  const elements = Array.from(document.querySelectorAll(selector))
    .filter(isVisible)
    .slice(0, 60)
    .map((element, index) => ({
      index: index + 1,
      tag: element.tagName.toLowerCase(),
      label: labelOf(element).slice(0, limit),
      fillable: element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea',
    }))
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter(isVisible)
    .map(heading => (heading.textContent ?? '').replace(/\s+/gu, ' ').trim())
    .filter(text => text.length > 0)
    .slice(0, 12)
  return {
    title: document.title,
    headings,
    elements,
    textChars: (document.body.textContent ?? '').replace(/\s+/gu, ' ').trim().length,
    path: window.location.pathname,
  }
}

/** The instruction that fixes the agent's output contract. */
export const AGENT_SYSTEM = [
  'You operate a web page for one user with one goal. You see only the interactive',
  'elements the page renders, each with an index. Choose the single next action.',
  '',
  'Reply with JSON and nothing else:',
  '{"reasoning":"<what you expect this action to do, one sentence>",',
  ' "action":{"kind":"click"|"type"|"back"|"done"|"stuck","index":<element index>,"text":"<text to type>"}}',
  '',
  'Rules:',
  '- Name an element by its index from the list you were given. Never invent an element.',
  '- "done" only when the goal is reached on the page you can see.',
  '- "stuck" when you expected a control or a piece of information that the page does not',
  '  offer: put what you expected and did not find in reasoning. Do not guess a path forward.',
  '- "index" is only read for click and type; omit it otherwise.',
  '- Prefer the action that makes progress toward the goal. Repeating an action that did',
  '  not change the page is not progress.',
].join('\n')

/**
 * Serialize one observation and the history into the turn prompt.
 * @param goal - the user's goal.
 * @param observation - what the page shows now.
 * @param trace - the turns already taken.
 * @returns the prompt for one decision.
 */
export function buildTurnPrompt(goal: string, observation: Observation, trace: readonly TraceEntry[]): string {
  const history = trace.length === 0
    ? '(nothing yet)'
    : trace.map(entry => String(entry.turn) + '. ' + entry.action + ' -> ' + entry.result).join('\n')
  const elements = observation.elements.length === 0
    ? '(no interactive element is visible)'
    : observation.elements.map(element => String(element.index) + '. <' + element.tag + '> ' + JSON.stringify(element.label) + (element.fillable ? ' (accepts text)' : '')).join('\n')
  return [
    'GOAL: ' + goal,
    'PAGE: ' + observation.title + ' (' + observation.path + ', ' + String(observation.textChars) + ' characters of text)',
    'HEADINGS: ' + (observation.headings.length === 0 ? '(none)' : observation.headings.join(' | ')),
    'ELEMENTS:',
    elements,
    'WHAT YOU ALREADY DID:',
    history,
    'Reply with the next action as JSON.',
  ].join('\n')
}

/** Reject a decision that names something the observation did not offer. */
function parseAction(value: unknown, elementCount: number): AgentAction {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('agent action must be a JSON object')
  const record = value as Record<string, unknown>
  const kind = record['kind']
  if (kind === 'done') return { kind: 'done' }
  if (kind === 'back') return { kind: 'back' }
  if (kind === 'stuck') {
    // The instruction tells the model to state the obstacle in its reasoning, so
    // an optional `reason` is read when present and the reasoning carries it
    // otherwise. Requiring both made every stuck report a contract violation.
    const reason = typeof record['reason'] === 'string' ? record['reason'].trim() : ''
    return { kind: 'stuck', reason }
  }
  if (kind === 'click' || kind === 'type') {
    const index = record['index']
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 1 || index > elementCount) {
      throw new Error('agent action index ' + String(index) + ' does not name one of the ' + String(elementCount) + ' observed elements')
    }
    if (kind === 'type') {
      const text = typeof record['text'] === 'string' ? record['text'] : ''
      return { kind: 'type', index, text }
    }
    return { kind: 'click', index }
  }
  throw new Error('agent action kind ' + JSON.stringify(kind ?? null) + ' is not one of click, type, back, done, stuck')
}

/**
 * Read one decision from the model's reply.
 * @param text - the model's reply.
 * @param elementCount - how many elements the observation offered.
 * @returns the parsed action and the agent's stated reasoning.
 */
export function parseDecision(text: string, elementCount: number): { reasoning: string; action: AgentAction } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('agent reply contains no JSON object')
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch (error: unknown) {
    throw new Error('agent reply is not valid JSON: ' + (error instanceof Error ? error.message : String(error)))
  }
  const record = parsed as Record<string, unknown>
  const reasoning = typeof record['reasoning'] === 'string' ? record['reasoning'].trim() : ''
  if (reasoning.length === 0) throw new Error('agent reply must state its reasoning')
  return { reasoning, action: parseAction(record['action'], elementCount) }
}

/** Render one action the way a reader should see it. */
function describe(action: AgentAction, observation: Observation): string {
  if (action.kind === 'back') return 'go back'
  if (action.kind === 'done') return 'finish the journey'
  if (action.kind === 'stuck') return 'report an obstacle'
  const element = observation.elements.find(entry => entry.index === action.index)
  const name = element === undefined ? '#' + String(action.index) : '<' + element.tag + '> ' + JSON.stringify(element.label)
  return action.kind === 'click' ? 'click ' + name : 'type ' + JSON.stringify(action.text) + ' into ' + name
}

/** Execute one action against the page. */
async function perform(page: Page, action: AgentAction, observation: Observation): Promise<string> {
  if (action.kind === 'back') {
    await page.goBack({ timeout: 10_000 }).catch(() => undefined)
    return 'went back'
  }
  if (action.kind === 'done') return 'finished'
  if (action.kind === 'stuck') return 'reported an obstacle'
  const element = observation.elements.find(entry => entry.index === action.index)
  if (element === undefined) return 'the element was no longer present'
  const selector = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]'
  const target = page.locator(selector).nth(action.index - 1)
  try {
    if (action.kind === 'click') await target.click({ timeout: 5_000 })
    else await target.fill(action.text, { timeout: 5_000 })
    return action.kind === 'click' ? 'clicked' : 'typed'
  } catch (error: unknown) {
    return 'the action failed: ' + (error instanceof Error ? error.message.split('\n')[0] ?? 'unknown' : String(error))
  }
}

/** Read one observation from the page. */
async function observe(page: Page): Promise<Observation> {
  await ensurePageHelpers(page)
  const evaluator = page as unknown as { evaluate: (fn: () => Observation) => Promise<Observation> }
  return await evaluator.evaluate(observePage)
}

/** One decision, supplied by the caller so the loop is testable without a model. */
export type Decide = (goal: string, observation: Observation, trace: readonly TraceEntry[]) => Promise<string>

/**
 * Drive the page toward one goal until the agent finishes, runs out of turns, or
 * stops making progress.
 * @param page - the page to operate.
 * @param goal - what the user is trying to achieve.
 * @param decide - one decision per turn.
 * @param options - turn budget and an optional per-turn hook.
 * @returns the trace, the obstacles, and why the run stopped.
 */
export async function runAgent(
  page: Page,
  goal: string,
  decide: Decide,
  options: { readonly budget?: number; readonly onTurn?: (entry: TraceEntry, observation: Observation) => Promise<void> } = {},
): Promise<AgentRun> {
  const budget = options.budget ?? DEFAULT_STEP_BUDGET
  const trace: TraceEntry[] = []
  const obstacles: string[] = []
  let repeats = 0
  let previous = ''
  for (let turn = 1; turn <= budget; turn += 1) {
    const observation = await observe(page)
    const signature = JSON.stringify(observation.elements.map(element => element.label))
    let reply: string
    try {
      reply = await decide(goal, observation, trace)
    } catch (error: unknown) {
      trace.push({ turn, reasoning: 'the model could not be reached', action: 'stop', result: error instanceof Error ? error.message : String(error), changed: false })
      return { reached: false, stopReason: 'error', trace, obstacles }
    }
    let decision: { reasoning: string; action: AgentAction }
    try {
      decision = parseDecision(reply, observation.elements.length)
    } catch (error: unknown) {
      trace.push({ turn, reasoning: 'the model did not answer with a usable action', action: 'stop', result: error instanceof Error ? error.message : String(error), changed: false })
      return { reached: false, stopReason: 'error', trace, obstacles }
    }
    if (decision.action.kind === 'done') {
      trace.push({ turn, reasoning: decision.reasoning, action: 'finish the journey', result: 'goal reached', changed: false })
      await options.onTurn?.(trace.at(-1) as TraceEntry, observation)
      return { reached: true, stopReason: 'goal-reached', trace, obstacles }
    }
    if (decision.action.kind === 'stuck') {
      obstacles.push(decision.reasoning)
      const stated = decision.action.kind === 'stuck' && decision.action.reason.length > 0 ? decision.action.reason : decision.reasoning
      trace.push({ turn, reasoning: decision.reasoning, action: 'report an obstacle', result: stated, changed: false })
      await options.onTurn?.(trace.at(-1) as TraceEntry, observation)
      return { reached: false, stopReason: 'no-progress', trace, obstacles }
    }
    const result = await perform(page, decision.action, observation)
    const after = await observe(page)
    const changed = JSON.stringify(after.elements.map(element => element.label)) !== signature || after.path !== observation.path
    repeats = changed ? 0 : previous === JSON.stringify(decision.action) ? repeats + 1 : 0
    previous = JSON.stringify(decision.action)
    const entry: TraceEntry = { turn, reasoning: decision.reasoning, action: describe(decision.action, observation), result, changed }
    trace.push(entry)
    await options.onTurn?.(entry, observation)
    if (repeats >= NO_PROGRESS_LIMIT) {
      obstacles.push('the same action was repeated ' + String(repeats + 1) + ' times without the page changing: ' + entry.action)
      return { reached: false, stopReason: 'no-progress', trace, obstacles }
    }
  }
  return { reached: false, stopReason: 'budget-exhausted', trace, obstacles }
}

/**
 * Build a decision function from the harness model service.
 * @param llm - the llm service.
 * @param route - the provider and model to ask.
 * @returns a function returning one reply per turn.
 */
export function llmDecide(llm: NarrativeLlm, route: { readonly provider: string; readonly model: string }): Decide {
  return async (goal, observation, trace) => {
    let text = ''
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: AGENT_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: buildTurnPrompt(goal, observation, trace) }] }],
      signal: new AbortController().signal,
    })) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    return text
  }
}
