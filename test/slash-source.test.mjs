/**
 * Regression tests for the runtime takeover of the official `/` skill source
 * (issue #14).
 *
 * This path replaces the old "patch the official file on disk" mechanism, which
 * broke whenever that file was not an ordinary writable file (a packaged
 * desktop build keeps it inside `app.asar`). What is worth locking down is the
 * contract with the official `inputTriggers` service:
 *
 *   - the source is located through `sources(trigger)`, falling back to `all()`;
 *   - the official `candidates` is asked for the WHOLE catalogue (empty query)
 *     because its own matcher filters everything a fuzzy query needs to see;
 *   - all three upgrades the file patch used to make are taken over (matching,
 *     group order, pick tracking) and fully restored on dispose;
 *   - nothing here may ever take the client down: a missing service, a throwing
 *     service, a frozen source or a ranking bug all degrade quietly.
 */

import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'

import {
  __resetSlashStateForTests,
  findSkillSource,
  installSlashFuzzy,
  isSkillSourceWrapped,
  slashEnhancementMode,
  warmSlashSkill,
  wrapSkillSource,
} from '../src/client/slash-source.js'

// The module keeps state on purpose (the wrapped source, the priming request,
// the per-Session cache), so every test starts from a clean slate.
beforeEach(() => __resetSlashStateForTests())

/** A stand-in for the official skill source. */
function makeSource(options = {}) {
  const calls = []
  const picks = []
  // Exposed so a test can change what the official source would return next —
  // which is how the cache is told apart from a fresh fetch.
  const list = options.list ?? [
    { name: 'backup-memory', description: '备份 DeepSeek Harness 的记忆库' },
    { name: 'ji-zhang', description: '记账：一句话报一笔开销' },
    { name: 'svg-diagram', description: '创建 SVG 图表' },
  ]
  const source = {
    trigger: '/',
    name: 'skill',
    order: 2,
    async candidates(projection, args) {
      calls.push({ projection, args })
      if (options.result !== undefined) return options.result
      // Mirror the official shape: the query selects, so an empty query is the
      // only way to see everything.
      const query = String(args?.query ?? '')
      return query === '' ? list : list.filter((s) => s.name.startsWith(query))
    },
    onPick({ candidate }) {
      picks.push(candidate.name)
      return { text: `/${candidate.name} ` }
    },
  }
  return { source, calls, picks, list }
}

/**
 * The REAL shape of `ctx.inputTriggers` on DSH 0.2.0-rc.2, read out of
 * `dsh-client-ui-input-trigger/lib/client.js`:
 *
 *   var InputTriggerService = class extends Service {
 *     static inject = ["sessions"];
 *     live = { sources: [], controllers: new WeakMapWithValues() };
 *     constructor(ctx) { super(ctx, "inputTriggers"); ... }
 *     registerSource(src) { ... live.sources.push(src) ... }
 *     sessionOf(...) { ... }
 *   }
 *
 * Its members are exactly: inject, live, constructor, registerSource, sessionOf,
 * sessions — there is NO `sources()` and NO `all()` on the service. Those two
 * live on the per-session controller's `roster`
 * (`{ sources: (trigger) => live.sources.filter(...), all: () => live.sources }`).
 *
 * Reaching for the roster helper on the service is what made the first release
 * of this module do nothing at all — silently, for ten seconds. The tests below
 * pin the real shape so that cannot come back.
 */
function makeService(sources) {
  return {
    live: { sources, controllers: { values: [] } },
    registerSource: (src) => {
      sources.push(src)
      return () => {}
    },
    sessionOf: () => undefined,
    sessions: () => undefined,
  }
}

/** The roster object a session controller is built with (a different shape). */
function makeRosterService(sources) {
  return {
    roster: {
      sources: (trigger) => sources.filter((s) => s.trigger === trigger),
      all: () => sources,
    },
  }
}

const rank = (items, query) => items.filter((s) => s.name.includes(query) || s.description.includes(query))

test('finds the source through the real service shape (live.sources)', () => {
  const { source } = makeSource()
  const registered = [{ trigger: '@', name: 'file' }, source]
  const service = makeService(registered)
  // Guard the premise: this service really has no roster helper of its own.
  assert.equal(service.sources, undefined)
  assert.equal(service.all, undefined)
  assert.equal(findSkillSource(service), source)
})

test('finds the source on an empty live.sources is not the same as finding one', () => {
  const service = makeService([])
  assert.equal(findSkillSource(service), undefined)
})

test('also copes with the roster helper shape', () => {
  const { source } = makeSource()
  assert.equal(findSkillSource(makeRosterService([source])), source)
})

test('passes on an unrelated source and still finds the skill one', () => {
  const { source } = makeSource()
  const service = makeService([{ trigger: '@', name: 'file' }, { trigger: '/', name: 'command' }, source])
  assert.equal(findSkillSource(service), source)
})

test('returns undefined while the source is not registered or the service is absent', () => {
  assert.equal(findSkillSource(undefined), undefined)
  assert.equal(findSkillSource(null), undefined)
  assert.equal(findSkillSource(makeService([{ trigger: '@', name: 'file' }])), undefined)
  // A throwing service must degrade, not propagate.
  assert.equal(findSkillSource({ sources: () => { throw new Error('boom') } }), undefined)
  assert.equal(findSkillSource({
    get live() {
      throw new Error('boom')
    },
  }), undefined)
})

test('asks the official candidates for the whole catalogue, then ranks it', async () => {
  const { source, calls } = makeSource()
  const restore = wrapSkillSource(source, { rank })
  assert.equal(typeof restore, 'function')

  const items = await source.candidates({ sessionId: 's1' }, { query: '记忆' })
  assert.deepEqual(items.map((s) => s.name), ['backup-memory'])
  // The official matcher only sees an empty query, so nothing is pre-filtered.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.query, '')
  assert.deepEqual(calls[0].projection, { sessionId: 's1' })
  restore()
})

test('an empty query IS ranked, so pinned skills lead the menu', async () => {
  // The menu and the ⚡ panel must agree. The panel ranks an empty query (that
  // is what puts 置顶 on top); returning the official list untouched here made
  // the menu look alphabetical while the panel led with 置顶.
  const { source } = makeSource()
  const seen = []
  const restore = wrapSkillSource(source, {
    rank: (items, query) => {
      seen.push(query)
      return [...items].sort((a, b) => Number(b.name === 'ji-zhang') - Number(a.name === 'ji-zhang'))
    },
  })
  const items = await source.candidates({ sessionId: 's1' }, { query: '' })
  assert.deepEqual(seen, [''])
  assert.equal(items.length, 3)
  assert.equal(items[0].name, 'ji-zhang', 'the pinned skill must come first')
  restore()
})

test('a ranking failure still returns the official list', async () => {
  const { source } = makeSource()
  const restore = wrapSkillSource(source, {
    rank: () => {
      throw new Error('ranking bug')
    },
  })
  const items = await source.candidates({ sessionId: 's1' }, { query: '备份' })
  assert.equal(items.length, 3)
  restore()
})

test('takes over the group order and restores the official one on dispose', () => {
  const { source } = makeSource()
  const restore = wrapSkillSource(source, { order: -1 })
  assert.equal(source.order, -1)
  restore()
  assert.equal(source.order, 2)
})

test('drops an order property the official source did not have', () => {
  const source = { trigger: '/', name: 'skill', async candidates() { return [] } }
  const restore = wrapSkillSource(source, { order: -1 })
  assert.equal(source.order, -1)
  restore()
  assert.equal(Object.hasOwn(source, 'order'), false)
})

test('records picks through the official onPick and keeps its return value', () => {
  const { source, picks } = makeSource()
  const tracked = []
  const restore = wrapSkillSource(source, { onPick: (name) => tracked.push(name) })
  const result = source.onPick({ candidate: { name: 'ji-zhang' } })
  assert.deepEqual(tracked, ['ji-zhang'])
  assert.deepEqual(picks, ['ji-zhang'])
  assert.deepEqual(result, { text: '/ji-zhang ' })
  restore()
  assert.equal(Object.hasOwn(source, 'onPick'), true)
  source.onPick({ candidate: { name: 'svg-diagram' } })
  assert.deepEqual(tracked, ['ji-zhang'])
})

test('a throwing pick tracker does not lose the official pick', () => {
  const { source, picks } = makeSource()
  const restore = wrapSkillSource(source, {
    onPick: () => {
      throw new Error('storage unavailable')
    },
  })
  assert.deepEqual(source.onPick({ candidate: { name: 'ji-zhang' } }), { text: '/ji-zhang ' })
  assert.deepEqual(picks, ['ji-zhang'])
  restore()
})

test('dispose restores the original candidates and clears the marker', async () => {
  const { source } = makeSource()
  const original = source.candidates
  const restore = wrapSkillSource(source, { rank })
  assert.equal(isSkillSourceWrapped(source), true)
  assert.notEqual(source.candidates, original)
  restore()
  assert.equal(isSkillSourceWrapped(source), false)
  assert.equal(source.candidates, original)
  // Restored behaviour is the official prefix matcher again.
  const items = await source.candidates({ sessionId: 's1' }, { query: 'svg' })
  assert.deepEqual(items.map((s) => s.name), ['svg-diagram'])
})

test('never wraps the same source twice', () => {
  const { source } = makeSource()
  const first = wrapSkillSource(source, { rank })
  assert.equal(typeof first, 'function')
  assert.equal(wrapSkillSource(source, { rank }), undefined)
  first()
  assert.equal(typeof wrapSkillSource(source, { rank }), 'function')
})

test('ignores anything that is not a wrappable source', () => {
  assert.equal(wrapSkillSource(undefined, { rank }), undefined)
  assert.equal(wrapSkillSource(null, { rank }), undefined)
  assert.equal(wrapSkillSource({ trigger: '/', name: 'skill' }, { rank }), undefined)
})

test('declines a frozen source instead of throwing out of apply', () => {
  const { source } = makeSource()
  Object.freeze(source)
  assert.equal(wrapSkillSource(source, { rank, order: -1 }), undefined)
  assert.equal(isSkillSourceWrapped(source), false)
})

test('installSlashFuzzy retries until the official source registers', async () => {
  const { source } = makeSource()
  const registered = []
  const service = makeService(registered)
  const dispose = installSlashFuzzy(service, { rank, order: -1 }, { attempts: 50, intervalMs: 5 })

  // The official half registers a moment later, as it does during client boot.
  await new Promise((resolve) => setTimeout(resolve, 15))
  registered.push(source)

  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.equal(isSkillSourceWrapped(source), true)
  assert.equal(source.order, -1)
  // The ⚡ panel footer reads this, so it doubles as the "is it actually on?" signal.
  assert.equal(slashEnhancementMode(), 'runtime')
  const items = await source.candidates({ sessionId: 's1' }, { query: '记账' })
  assert.deepEqual(items.map((s) => s.name), ['ji-zhang'])
  dispose()
  assert.equal(isSkillSourceWrapped(source), false)
  assert.equal(source.order, 2)
  assert.equal(slashEnhancementMode(), undefined)
})

test('installSlashFuzzy gives up loudly when the source never appears', async () => {
  const service = makeService([])
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => warnings.push(args.join(' '))
  let dispose
  try {
    dispose = installSlashFuzzy(service, { rank, order: -1 }, { attempts: 2, intervalMs: 5 })
    await new Promise((resolve) => setTimeout(resolve, 30))
  } finally {
    console.warn = originalWarn
  }
  assert.equal(typeof dispose, 'function')
  assert.equal(slashEnhancementMode(), undefined)
  // Silence here is what hid the first release's no-op for ten seconds.
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /was not found/)
  assert.match(warnings[0], /issues\/14/)
  dispose()
})

test('warmSlashSkill fills OUR cache, not just the official one', async () => {
  const { source, calls } = makeSource()
  // v0.5.16/v0.5.17 primed through the official `warm()`, which leaves our own
  // cache empty — so the menu's call still missed and still lost the race.
  const warmed = []
  source.warm = (session) => warmed.push(session)
  const restore = wrapSkillSource(source, { rank })
  warmSlashSkill('s1')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(warmed, [], 'must not settle for the official warm() alone')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args.query, '')
  assert.deepEqual(calls[0].projection, { sessionId: 's1' })
  restore()
})

test('a primed Session answers the menu without waiting on the official source', async () => {
  // The one property the whole fix rests on: after priming, the menu's call must
  // resolve immediately instead of awaiting a slow fetch, because the highlight
  // goes to whichever group settles first.
  const list = [{ name: 'a', description: 'A' }]
  const source = {
    trigger: '/',
    name: 'skill',
    order: 2,
    candidates: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
      return list
    },
  }
  const restore = wrapSkillSource(source, { rank })
  warmSlashSkill('slow-session')
  await new Promise((resolve) => setTimeout(resolve, 120))

  const started = Date.now()
  const items = await source.candidates({ sessionId: 'slow-session' }, { query: '' })
  const elapsed = Date.now() - started
  assert.equal(items.length, 1)
  assert.ok(elapsed < 30, `a cache hit must not wait for the 60ms fetch (took ${elapsed}ms)`)
  restore()
})

test('warmSlashSkill ignores an empty session and swallows failures', () => {
  const { source } = makeSource()
  source.candidates = async () => { throw new Error('boom') }
  const restore = wrapSkillSource(source, { rank })
  assert.doesNotThrow(() => warmSlashSkill(''))
  assert.doesNotThrow(() => warmSlashSkill(undefined))
  assert.doesNotThrow(() => warmSlashSkill('s1'))
  restore()
  assert.doesNotThrow(() => warmSlashSkill('s1'))
})

test('serves a primed Session from the cache instead of re-fetching', async () => {
  const { source, calls, list } = makeSource()
  const restore = wrapSkillSource(source, { rank })

  // First call is a miss: it fetches and fills the cache.
  const primed = await source.candidates({ sessionId: 'cache-1' }, { query: '' })
  assert.equal(calls.length, 1)
  assert.equal(primed.length, 3)

  // The official source would now answer differently...
  list.push({ name: 'brand-new-skill', description: '刚装的技能' })

  // ...but a cache hit must answer from the cache, immediately.
  const served = await source.candidates({ sessionId: 'cache-1' }, { query: '' })
  assert.equal(served.length, 3)

  // The background refresh catches up for the next open.
  await new Promise((resolve) => setTimeout(resolve, 10))
  const refreshed = await source.candidates({ sessionId: 'cache-1' }, { query: '' })
  assert.equal(refreshed.length, 4)
  restore()
})

test('a cache hit still applies the ranking to the served list', async () => {
  const { source } = makeSource()
  const restore = wrapSkillSource(source, { rank })
  await source.candidates({ sessionId: 'cache-2' }, { query: '' })
  const items = await source.candidates({ sessionId: 'cache-2' }, { query: '记账' })
  assert.deepEqual(items.map((s) => s.name), ['ji-zhang'])
  restore()
})

test('one Session never serves another Session its cache', async () => {
  const { source, calls } = makeSource()
  const restore = wrapSkillSource(source, { rank })
  await source.candidates({ sessionId: 'session-a' }, { query: '' })
  assert.equal(calls.length, 1)
  await source.candidates({ sessionId: 'session-b' }, { query: '' })
  assert.equal(calls.length, 2)
  restore()
})

test('priming a Session before the takeover lands is not lost', async () => {
  // The picker mounts before the takeover installs, so the warm request arrives
  // first and has nowhere to go. wrapSkillSource must consume it.
  warmSlashSkill('early-session')
  const { source, calls } = makeSource()
  const restore = wrapSkillSource(source, { rank })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].projection, { sessionId: 'early-session' })
  restore()
})

