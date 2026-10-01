/**
 * Shared picker state — the desktop app, the web UI and a phone must read one
 * pinned/usage list instead of one per browser origin.
 *
 * `localStorage` and `fetch` are stubbed because the module reads them as
 * globals; both are touched at call time, so installing them before the first
 * call is enough.
 */

import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

import {
  PINNED_KEY,
  USAGE_KEY,
  pullSharedState,
  pushSharedState,
  syncSharedState,
} from '../src/client/shared-state.js'

/** A minimal localStorage stand-in. */
function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    dump: () => Object.fromEntries(map),
  }
}

/** Record every request and answer with the queued response. */
function makeFetch(answer) {
  const calls = []
  const impl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    const response = await answer({ url, method: options.method ?? 'GET', body: options.body })
    return {
      ok: response.status === undefined ? true : response.status < 400,
      status: response.status ?? 200,
      json: async () => response.body,
    }
  }
  return { calls, impl }
}

beforeEach(() => {
  globalThis.localStorage = makeStorage({
    [PINNED_KEY]: JSON.stringify(['ji-zhang']),
    [USAGE_KEY]: JSON.stringify({ 'ji-zhang': { count: 2, lastUsed: 100 } }),
  })
})

/** Pretend this browser has already synced once, so it now follows the file. */
function markAlreadySynced() {
  localStorage.setItem('dsh-skill-picker:shared-synced', '1')
}

test('a FIRST sync with local data unions instead of adopting', async () => {
  // The trap this guards: whichever client boots first writes the file, and a
  // plain adopt would then wipe the pins of every other client.
  const { calls, impl } = makeFetch(({ method }) => {
    if (method === 'GET') return { body: { ok: true, state: { pinned: ['from-the-other-end'], usage: {} } } }
    return { body: { ok: true, state: { pinned: ['from-the-other-end', 'ji-zhang'], usage: {} } } }
  })
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  const pushed = calls.find((call) => call.method === 'PUT')
  assert.ok(pushed !== undefined, 'a first sync must push (with migrate=1)')
  assert.match(pushed.url, /migrate=1/)
  assert.deepEqual(JSON.parse(pushed.body).pinned, ['ji-zhang'])
  // …and adopt the union the host returned.
  assert.deepEqual(JSON.parse(localStorage.getItem(PINNED_KEY)), ['from-the-other-end', 'ji-zhang'])
})

test('once synced, the shared file wins so removals propagate', async () => {
  markAlreadySynced()
  const { calls, impl } = makeFetch(() => ({ body: { ok: true, state: { pinned: ['only-this'], usage: {} } } }))
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  assert.equal(calls.length, 1, 'a synced browser adopts, it does not push')
  assert.deepEqual(JSON.parse(localStorage.getItem(PINNED_KEY)), ['only-this'])
})

test('a first sync still adopts when this browser has nothing to contribute', async () => {
  globalThis.localStorage = makeStorage({})
  const { calls, impl } = makeFetch(() => ({ body: { ok: true, state: { pinned: ['a'], usage: {} } } }))
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  assert.deepEqual(calls.map((call) => call.method), ['GET'])
  assert.deepEqual(JSON.parse(localStorage.getItem(PINNED_KEY)), ['a'])
})

test('pull adopts the shared file into the local mirror', async () => {
  markAlreadySynced()
  const { calls, impl } = makeFetch(() => ({ body: { ok: true, state: { pinned: ['a', 'b'], usage: { a: { count: 1, lastUsed: 5 } } } } }))
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.deepEqual(JSON.parse(localStorage.getItem(PINNED_KEY)), ['a', 'b'])
  assert.deepEqual(JSON.parse(localStorage.getItem(USAGE_KEY)), { a: { count: 1, lastUsed: 5 } })
})

test('a missing shared file is seeded from this browser, with migrate=1', async () => {
  const { calls, impl } = makeFetch(() => ({ body: { ok: true, state: null } }))
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[1].method, 'PUT')
  assert.match(calls[1].url, /migrate=1/)
  // The seed carries what this browser already had.
  assert.deepEqual(JSON.parse(calls[1].body).pinned, ['ji-zhang'])
})

test('the migration response (the union) is adopted locally', async () => {
  let push = 0
  const { impl } = makeFetch(({ method }) => {
    if (method === 'GET') return { body: { ok: true, state: null } }
    push += 1
    return { body: { ok: true, state: { pinned: ['ji-zhang', 'douyin-to-obsidian'], usage: {} } } }
  })
  globalThis.fetch = impl

  await pullSharedState()
  assert.equal(push, 1)
  assert.deepEqual(JSON.parse(localStorage.getItem(PINNED_KEY)), ['ji-zhang', 'douyin-to-obsidian'])
})

test('an empty shared file does not blank a mirror that has data', async () => {
  const { calls, impl } = makeFetch(({ method }) => {
    if (method === 'GET') return { body: { ok: true, state: { pinned: [], usage: {} } } }
    return { body: { ok: true, state: JSON.parse(calls[calls.length - 1].body) } }
  })
  globalThis.fetch = impl

  assert.equal(await pullSharedState(), true)
  const pushed = calls.find((call) => call.method === 'PUT')
  assert.ok(pushed !== undefined, 'the only surviving copy must be pushed, not overwritten by silence')
  assert.deepEqual(JSON.parse(pushed.body).pinned, ['ji-zhang'])
})

test('push sends the current mirror', async () => {
  const { calls, impl } = makeFetch(() => ({ body: { ok: true, state: { pinned: [], usage: {} } } }))
  globalThis.fetch = impl

  assert.equal(await pushSharedState(), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PUT')
  assert.equal(calls[0].url, '/dsh-skill-picker/state')
  assert.deepEqual(JSON.parse(calls[0].body), {
    pinned: ['ji-zhang'],
    usage: { 'ji-zhang': { count: 2, lastUsed: 100 } },
  })
})

test('a failing host never throws and reports false', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ ok: false }) })
  assert.equal(await pullSharedState(), false)
  assert.equal(await pushSharedState(), false)

  globalThis.fetch = async () => { throw new Error('offline') }
  assert.equal(await pullSharedState(), false)
  assert.equal(await pushSharedState(), false)
  assert.equal(await syncSharedState(), false)
})

test('sync announces the refresh so open surfaces re-read the mirror', async () => {
  const events = []
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) }
  globalThis.Event = class { constructor(type) { this.type = type } }
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, state: { pinned: ['x'], usage: {} } }),
  })

  assert.equal(await syncSharedState(), true)
  assert.deepEqual(events, ['dsh-skill-picker:shared-state'])
  delete globalThis.window
  delete globalThis.Event
})