// Coverage for the goal-driven agent loop. A script can only confirm the path
// its author imagined; these cases pin what the loop does when the agent
// chooses its own actions, gets stuck, or is handed a page it cannot act on.
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { DEFAULT_STEP_BUDGET, MAX_OBSERVED_ELEMENTS, NO_PROGRESS_LIMIT, buildTurnPrompt, observePage, parseDecision, runAgent } from '../src/experience/agent.ts'
import type { Observation } from '../src/experience/agent.ts'

/** A page stub that serves a fixed element list and applies named clicks. */
function page(labels: readonly string[], options: { onBack?: () => void } = {}) {
  let current = [...labels]
  const stub = {
    clicked: [] as number[],
    viewportSize: () => ({ width: 1280, height: 720 }),
    evaluate: async (fn: () => Observation) => {
      const elements = current.map((label, index) => ({ index: index + 1, tag: 'a', label, fillable: false }))
      const observation: Observation = { title: 'Fixture', headings: [], elements, textChars: 10, path: '/a' }
      // observePage reads the document; the stub answers with the same shape.
      return fn === observePage ? observation : observation
    },
    locator: () => ({ nth: (index: number) => ({ click: async () => { stub.clicked.push(index + 1) }, fill: async () => {} }) }),
    goBack: async () => { options.onBack?.() },
  }
  return { stub, set: (next: readonly string[]) => { current = [...next] } }
}

/** One scripted reply per turn. */
function scripted(replies: readonly string[]) {
  let turn = 0
  return async (): Promise<string> => {
    const reply = replies[turn] ?? replies.at(-1) ?? ''
    turn += 1
    return reply
  }
}

describe('observation', () => {
  it('names elements by index and never invents one', () => {
    document.body.innerHTML = '<button>Save</button><input placeholder="Email" /><a href="/x">Home</a>'
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      ;(element as HTMLElement).getBoundingClientRect = () => ({ width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    }
    const observation = observePage()
    expect(observation.elements.map(entry => entry.label)).toEqual(['Save', 'Email', 'Home'])
    expect(observation.elements[0]?.index).toBe(1)
    expect(observation.elements.map(entry => entry.fillable)).toEqual([false, true, false])
  })

  it('bounds the elements one observation carries', () => {
    document.body.innerHTML = Array.from({ length: MAX_OBSERVED_ELEMENTS + 20 }, (_unused, index) => '<button>B' + String(index) + '</button>').join('')
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      ;(element as HTMLElement).getBoundingClientRect = () => ({ width: 10, height: 10, left: 0, top: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    }
    expect(observePage().elements).toHaveLength(MAX_OBSERVED_ELEMENTS)
  })
})

describe('decision parsing', () => {
  it('accepts a contracted decision', () => {
    expect(parseDecision('{"reasoning":"open the cart","action":{"kind":"click","index":2}}', 3).action).toEqual({ kind: 'click', index: 2 })
  })

  it('rejects an index the observation did not offer', () => {
    expect(() => parseDecision('{"reasoning":"x","action":{"kind":"click","index":9}}', 3)).toThrow(/does not name one of the 3/)
  })

  it('rejects a reply with no reasoning', () => {
    expect(() => parseDecision('{"action":{"kind":"done"}}', 3)).toThrow(/must state its reasoning/)
  })

  it('reads a stuck report whose obstacle is stated in the reasoning', () => {
    // The instruction tells the model to state it there, so requiring it twice
    // would turn every obstacle report into a contract violation.
    expect(parseDecision('{"reasoning":"no search field is visible","action":{"kind":"stuck"}}', 3).action).toEqual({ kind: 'stuck', reason: '' })
  })

  it('rejects an unknown action kind', () => {
    expect(() => parseDecision('{"reasoning":"x","action":{"kind":"teleport"}}', 3)).toThrow(/is not one of click/)
  })
})

describe('the loop', () => {
  it('stops when the agent reports the goal reached', async () => {
    const { stub } = page(['Home'])
    const run = await runAgent(stub as never, 'open the cart', scripted([
      '{"reasoning":"the cart link is here","action":{"kind":"click","index":1}}',
      '{"reasoning":"the cart is open","action":{"kind":"done"}}',
    ]))
    expect(run.reached).toBe(true)
    expect(run.stopReason).toBe('goal-reached')
    expect(run.trace).toHaveLength(2)
    expect(run.trace[0]?.action).toContain('click')
  })

  it('records the obstacle the agent reports', async () => {
    const { stub } = page(['Home'])
    const run = await runAgent(stub as never, 'search for a course', scripted([
      '{"reasoning":"I expected a search field and see only navigation links","action":{"kind":"stuck","reason":"no search control is visible"}}',
    ]))
    expect(run.reached).toBe(false)
    expect(run.stopReason).toBe('no-progress')
    expect(run.obstacles[0]).toContain('expected a search field')
  })

  it('stops when the same action repeats without the page changing', async () => {
    const { stub } = page(['Home'])
    const run = await runAgent(stub as never, 'open the cart', scripted([
      '{"reasoning":"try the link","action":{"kind":"click","index":1}}',
    ]))
    expect(run.stopReason).toBe('no-progress')
    expect(run.trace.length).toBeLessThanOrEqual(NO_PROGRESS_LIMIT + 1)
    expect(run.obstacles[0]).toContain('without the page changing')
  })

  it('stops at the turn budget', async () => {
    const { stub, set } = page(['Home'])
    let turn = 0
    const run = await runAgent(stub as never, 'wander', async () => {
      turn += 1
      set(['Page ' + String(turn)])
      return '{"reasoning":"keep going","action":{"kind":"click","index":1}}'
    }, { budget: 4 })
    expect(run.stopReason).toBe('budget-exhausted')
    expect(run.trace).toHaveLength(4)
  })

  it('uses the default budget when none is declared', async () => {
    const { stub, set } = page(['Home'])
    let turn = 0
    const run = await runAgent(stub as never, 'wander', async () => {
      turn += 1
      set(['Page ' + String(turn)])
      return '{"reasoning":"keep going","action":{"kind":"click","index":1}}'
    })
    expect(run.trace).toHaveLength(DEFAULT_STEP_BUDGET)
  })

  it('stops with an error when the model cannot be reached', async () => {
    const { stub } = page(['Home'])
    const run = await runAgent(stub as never, 'x', async () => { throw new Error('provider refused') })
    expect(run.stopReason).toBe('error')
    expect(run.trace[0]?.result).toContain('provider refused')
  })

  it('stops with an error when the model answers with an unusable action', async () => {
    const { stub } = page(['Home'])
    const run = await runAgent(stub as never, 'x', scripted(['not json at all']))
    expect(run.stopReason).toBe('error')
    expect(run.trace[0]?.result).toContain('no JSON object')
  })
})

describe('the turn prompt', () => {
  it('lists the elements the agent may name and what it already did', () => {
    const observation: Observation = {
      title: 'Fixture', headings: ['Courses'], textChars: 100, path: '/courses',
      elements: [{ index: 1, tag: 'button', label: 'Enrol', fillable: false }],
    }
    const prompt = buildTurnPrompt('enrol in a course', observation, [{ turn: 1, reasoning: 'look', action: 'click <a> "Home"', result: 'clicked', changed: true }])
    expect(prompt).toContain('GOAL: enrol in a course')
    expect(prompt).toContain('1. <button> "Enrol"')
    expect(prompt).toContain('Home')
  })
})
