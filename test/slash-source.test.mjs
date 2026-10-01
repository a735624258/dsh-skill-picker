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
import test from 'node:test'

import {
  findSkillSource,
  installSlashFuzzy,
  isSkillSourceWrapped,
  wrapSkillSource,
} from '../src/client/slash-source.js'

/** A stand-in for the official skill source. */
function makeSource(options = {}) {
  const calls = []
  const picks = []
  const source = {
    trigger: '/',
    name: 'skill',
    order: 2,
    async candidates(projection, args) {
      calls.push({ projection, args })
      if (options.result !== undefined) return options.result
      // Mirror the official shape: the query selects, so an empty query is the
      // only way to see everything.
      const all = [
        { name: 'backup-memory', description: '备份 DeepSeek Harness 的记忆库' },
        { name: 'ji-zhang', description: '记账：一句话报一笔开销' },
        { name: 'svg-diagram', description: '创建 SVG 图表' },
      ]
      const query = String(args?.query ?? '')
      return query === '' ? all : all.filter((s) => s.name.startsWith(query))
    },
    onPick({ candidate }) {
      picks.push(candidate.name)
      return { text: `/${candidate.name} ` }
    },
  }
  return { source, calls, picks }
}

/** A minimal fake of the injected inputTriggers service. */
function makeService(sources) {
  return {
    sources: (trigger) => sources.filter((s) => s.trigger === trigger),
    all: () => sources,
  }
}

const rank = (items, query) => items.filter((s) => s.name.includes(query) || s.description.includes(query))

test('finds the official skill source through sources(trigger)', () => {
  const { source } = makeSource()
  const service = makeService([{ trigger: '@', name: 'file' }, source])
  assert.equal(findSkillSource(service), source)
})

test('falls back to all() when the per-trigger helper yields nothing', () => {
  const { source } = makeSource()
  const service = { sources: () => [], all: () => [source] }
  assert.equal(findSkillSource(service), source)
})

test('returns undefined while the source is not registered or the service is absent', () => {
  assert.equal(findSkillSource(undefined), undefined)
  assert.equal(findSkillSource(null), undefined)
  assert.equal(findSkillSource(makeService([{ trigger: '@', name: 'file' }])), undefined)
  // A throwing service must degrade, not propagate.
  assert.equal(findSkillSource({ sources: () => { throw new Error('boom') } }), undefined)
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

test('an empty query returns the official result untouched', async () => {
  const { source } = makeSource()
  const restore = wrapSkillSource(source, {
    rank: () => {
      throw new Error('ranking must not run for an empty query')
    },
  })
  const items = await source.candidates({ sessionId: 's1' }, { query: '' })
  assert.equal(items.length, 3)
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
  const items = await source.candidates({ sessionId: 's1' }, { query: '记账' })
  assert.deepEqual(items.map((s) => s.name), ['ji-zhang'])
  dispose()
  assert.equal(isSkillSourceWrapped(source), false)
  assert.equal(source.order, 2)
})

test('installSlashFuzzy gives up quietly when the source never appears', async () => {
  const service = makeService([])
  const dispose = installSlashFuzzy(service, { rank, order: -1 }, { attempts: 2, intervalMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(typeof dispose, 'function')
  dispose()
})
