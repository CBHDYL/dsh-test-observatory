/**
 * A fixture application with one deliberate defect per route.
 *
 * The purpose of this app is calibration, not demonstration: each route plants a
 * single defect of a known class, and a check that claims to detect that class
 * must find it here. A check that finds nothing on its own route is not working,
 * and a check that reports anything on the clean route is producing noise —
 * both are failures, so the fixture is built to test in both directions.
 *
 * It serves over real HTTP so the checks run against a browser parsing real
 * markup, not a string handed to a DOM implementation.
 * @module @deepseek-ai/dsh-test-observatory/fixtures/defective-app
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'

/** One route and the defect it plants. */
export interface FixtureRoute {
  /** Path the route answers on. */
  readonly path: string
  /** The defect class planted here, or `none` for the clean control. */
  readonly defect: string
  /** The page body. */
  readonly body: string
}

/** Shared head so every route is a valid document. */
const HEAD = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>'

/** Styling that gives planted elements a size, so they are genuinely rendered. */
const STYLE = '<style>body{font-family:system-ui;margin:16px}button,a,input{width:80px;height:24px;display:inline-block}.hidden{display:none}.zero{width:0;height:0;overflow:hidden}</style>'

/** Every route this fixture serves. */
export const FIXTURE_ROUTES: readonly FixtureRoute[] = [
  {
    path: '/clean',
    defect: 'none',
    body: HEAD + STYLE + '<body><main><h1>Clean</h1><button>Primary action</button><a href="/clean">A labelled link</a>'
      + '<label for="named">Email</label><input id="named" name="email">'
      + '<img src="/assets/present.svg" alt="A described picture" width="16" height="16">'
      + '</body></html>',
  },
  {
    path: '/no-focus-indicator',
    defect: 'keyboard-focus-not-visible',
    body: HEAD + '<style>button:focus,a:focus,input:focus{outline:none;box-shadow:none}</style>'
      + '<body><main><h1>No focus ring</h1><button>Primary action</button><a href="/clean">A labelled link</a></main></body></html>',
  },
  {
    path: '/broken-image',
    defect: 'image-broken',
    body: HEAD + STYLE + '<body><main><h1>Broken image</h1><img src="/assets/absent.png" alt="Missing" width="16" height="16"></main></body></html>',
  },
  {
    path: '/image-without-alt',
    defect: 'image-no-alt',
    body: HEAD + STYLE + '<body><main><h1>No alt</h1><img src="/assets/present.svg" width="16" height="16"></main></body></html>',
  },
  {
    path: '/placeholder-only',
    defect: 'placeholder-only-field',
    body: HEAD + STYLE + '<body><main><h1>Placeholder only</h1><input placeholder="Email address"></main></body></html>',
  },
  {
    path: '/no-heading',
    defect: 'axe:page-has-heading-one',
    body: HEAD + STYLE + '<body><main><p>This page has no level-one heading at all.</p></main></body></html>',
  },
  {
    path: '/unnamed-button',
    defect: 'axe:button-name',
    body: HEAD + STYLE + '<body><main><h1>Unnamed control</h1><button></button></main></body></html>',
  },
]

/** A one-pixel SVG standing in for a picture that loads. */
const PRESENT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#635bff"/></svg>'

/** A running fixture app. */
export interface FixtureApp {
  /** Base URL, without a trailing slash. */
  readonly origin: string
  /** Stop the server. */
  readonly close: () => Promise<void>
}

/**
 * Start the fixture app on an ephemeral port.
 * @returns the running app and its origin.
 */
export async function startFixtureApp(): Promise<FixtureApp> {
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/'
    if (path === '/assets/present.svg') {
      response.writeHead(200, { 'content-type': 'image/svg+xml' })
      response.end(PRESENT_SVG)
      return
    }
    const route = FIXTURE_ROUTES.find(candidate => candidate.path === path)
    if (route === undefined) {
      response.writeHead(404, { 'content-type': 'text/html' })
      response.end('<!DOCTYPE html><html lang="en"><body><h1>Not found</h1></body></html>')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(route.body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    // Port 0 asks the operating system for a free port, so two specs running
    // beside each other cannot collide.
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('the fixture server did not report a port')
  return {
    origin: 'http://127.0.0.1:' + String(address.port),
    close: async () => { await new Promise<void>((resolve, reject) => { server.close(error => { if (error === undefined || error === null) resolve(); else reject(error) }) }) },
  }
}