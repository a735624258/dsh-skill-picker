/**
 * Runtime takeover of the official `/` skill source (issue #14).
 *
 * The picker upgrades the official `/` completion from prefix matching to
 * fuzzy + pinyin matching. Until 0.5.14 that was done by rewriting the official
 * `@deepseek-ai/dsh-client-ui-skill/lib/client.js` **file** on disk — which
 * silently stops working whenever that file is not an ordinary writable file:
 * a packaged desktop build keeps it inside `resources/app.asar`, pnpm
 * hardlinks it into a shared store, or a profile's copy is a dangling symlink
 * after the app moves. Every one of those cases produced the same invisible
 * failure: the patch "succeeded" on a copy nothing was serving.
 *
 * This module takes the other road. `@deepseek-ai/dsh-client-ui-input-trigger`
 * publishes its trigger-source registry through the public `inputTriggers`
 * service:
 *
 *   sources: (trigger) => live.sources.filter(s => s.trigger === trigger)...
 *   all:     () => live.sources
 *
 * Those hand back the **live source objects**, and the slash menu reads
 * `source.candidates` at invocation time rather than capturing it at
 * registration. So the picker can wrap that one method and own the matching
 * behaviour without touching a single file, on every install shape at once.
 *
 * What this module deliberately does NOT do: register a second source for
 * `/skill`. The registry rejects duplicate `(trigger, name)` pairs outright
 * (`slash source "/skill" is already registered`), which is why an earlier
 * version of this plugin tried — and abandoned — the parallel-source approach.
 * Wrapping the existing source is the supported way in.
 *
 * @module dsh-skill-picker/client/slash-source
 */

/** Marker recorded on a wrapped source, so re-installing is a no-op. */
const WRAPPED = '__dshSkillPickerWrappedCandidates'

/** Identity of the official skill source inside the trigger registry. */
export const SKILL_SOURCE = { trigger: '/', name: 'skill' }

/** Whether this source already carries the picker's wrapper. */
export function isSkillSourceWrapped(source) {
  return source !== null && typeof source === 'object' && source[WRAPPED] === true
}

/** Set once the runtime takeover is live; read by the ⚡ panel footer. */
let enhancementMode

/** The source the takeover wrapped, so the catalogue can be primed ahead of time. */
let takenOverSource

/** The Session the picker last asked us to prime; consumed when the takeover lands. */
let pendingSessionId

/**
 * Our own copy of the full display list, per Session.
 *
 * Why it exists: the menu highlights **the first group whose `candidates()`
 * promise settles**, and our wrapper used to add an `await` hop of its own on
 * top of the official one — two hops against the command source's chain. A
 * settled-promise `await` is a microtask, so hop count decides, and the menu
 * scrolled down to the command group. Serving the cached list returns without
 * awaiting anything, so this group wins the settle race by construction.
 *
 * Kept fresh by the priming call and by a background refresh on every serve, so
 * the worst case is one menu open behind a very recent skill install.
 */
const itemCache = new Map()

/** Write a small diagnostic record the maintainer can read off disk. */
function noteDiag(patch) {
  try {
    const key = 'dsh-skill-picker:diag'
    const previous = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...previous, ...patch, at: new Date().toISOString() }))
  } catch {
    /* diagnostics must never break anything */
  }
}

/**
 * Refresh our cached display list in the background for the next open.
 * Never awaited, never throws, and uses its own abort signal so the menu's own
 * controller cannot cancel the refresh when it closes.
 */
function refreshCache(cacheKey, originalCandidates, self, projection, options) {
  try {
    const signal = typeof AbortController === 'function' ? new AbortController().signal : undefined
    Promise.resolve()
      .then(() => originalCandidates.call(self, projection, { ...options, query: '', signal }))
      .then((items) => {
        if (Array.isArray(items)) itemCache.set(cacheKey, items.slice())
      })
      .catch(() => {})
  } catch {
    /* a refresh that cannot start is not worth reporting */
  }
}

/** Which mechanism upgrades the official `/` menu: 'runtime' once installed. */
export function slashEnhancementMode() {
  return enhancementMode
}

/**
 * Test seam: drop every piece of module-level state.
 *
 * This module deliberately keeps state across calls (the wrapped source, the
 * priming request, the per-Session cache), which makes tests order-dependent
 * unless they start from a clean slate. Not used by the runtime.
 * @internal
 */
export function __resetSlashStateForTests() {
  itemCache.clear()
  pendingSessionId = undefined
  takenOverSource = undefined
  enhancementMode = undefined
}

/**
 * Prime the official skill catalogue for a Session, and fill our own cache.
 *
 * The slash menu highlights **the first group that settles** and then scrolls it
 * into view (`scrollIntoView({ block: "nearest" })`), and the highlight sticks
 * once set. The picker keeps the skill group first (`order: -1`), so if the
 * command group settles first the menu opens scrolled down to it — the "menu
 * opens at the bottom" report.
 *
 * Nothing warms the skill catalogue on a normal boot: `input-trigger` calls
 * `source.warm?.()` only from `sourceAdded`, which fires just for a source
 * registered *after* a session controller already exists.
 *
 * Called as soon as the picker knows its Session — which can happen BEFORE the
 * takeover installs, since that retries while the official source registers. The
 * Session id is therefore remembered and the warming is retried from
 * `wrapSkillSource()`, otherwise a mount-time call would be silently lost.
 *
 * Best-effort by design: a failed warm changes nothing.
 *
 * @param sessionId - the active Session's id.
 */
export function warmSlashSkill(sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return
  // Ready now: prime directly and keep nothing pending. Not ready (the takeover
  // has not installed yet): remember it, and wrapSkillSource() will consume it.
  if (primeNow(sessionId)) pendingSessionId = undefined
  else pendingSessionId = sessionId
}

/**
 * Do the priming work once the takeover can actually serve it.
 * @returns true when the source exists and was asked (or the cache already had it).
 */
function primeNow(sessionId) {
  const source = takenOverSource
  if (source === null || source === undefined) return false
  if (itemCache.has(sessionId)) return true
  try {
    // Go through the WRAPPER's own path, never the official `warm()` alone:
    // `warm()` primes only the official module's cache, leaving OUR cache empty,
    // so the menu's own call still misses and still awaits — which is exactly
    // how v0.5.16/v0.5.17 kept losing the settle race. The wrapper stores a
    // snapshot on a miss, so this single call fills both layers.
    const signal = typeof AbortController === 'function' ? new AbortController().signal : undefined
    Promise.resolve(source.candidates({ sessionId }, { query: '', signal })).catch(() => {})
  } catch {
    /* priming is best-effort */
  }
  return true
}


/** Whether an object is the official skill source. */
function isSkillSource(source) {
  return source !== null && typeof source === 'object'
    && source.trigger === SKILL_SOURCE.trigger
    && source.name === SKILL_SOURCE.name
}

/**
 * Every place the live source registry has actually been observed, most precise
 * first. **The service itself does NOT expose `sources()` / `all()`** — those
 * belong to the per-session controller's `roster`, built as
 * `{ sources: (trigger) => live.sources.filter(...), all: () => live.sources }`.
 * The service (`ctx.inputTriggers`, an `InputTriggerService extends Service`) is
 * exactly: `inject, live, constructor, registerSource, sessionOf, sessions` —
 * so `live.sources` is the real registry and the one that matters. The other
 * shapes are kept because reaching for a helper that does not exist is what
 * made the first release of this module silently do nothing.
 *
 * @param service - the injected inputTriggers service.
 * @returns arrays to search, in order.
 */
function registryCandidates(service) {
  const lists = []
  const push = (value) => {
    if (Array.isArray(value) && value.length > 0) lists.push(value)
  }
  try { push(service.live?.sources) } catch { /* getter threw */ }
  try { if (typeof service.sources === 'function') push(service.sources(SKILL_SOURCE.trigger)) } catch { /* ignore */ }
  try { if (typeof service.all === 'function') push(service.all()) } catch { /* ignore */ }
  try { push(service.sources) } catch { /* ignore */ }
  try { if (typeof service.roster?.sources === 'function') push(service.roster.sources(SKILL_SOURCE.trigger)) } catch { /* ignore */ }
  try { if (typeof service.roster?.all === 'function') push(service.roster.all()) } catch { /* ignore */ }
  return lists
}

/**
 * Locate the official skill source through the injected `inputTriggers` service.
 * Returns the **live object**, so the caller can take it over in place.
 *
 * @param service - the injected service, if the host provided one.
 * @returns the source object, or undefined while it is not registered yet.
 */
export function findSkillSource(service) {
  if (service === null || service === undefined) return undefined
  for (const list of registryCandidates(service)) {
    const found = list.find(isSkillSource)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Take the official source over at runtime: matching, group order and pick
 * tracking — the same three upgrades the file patch used to apply, without
 * writing a single byte to disk. Returns a disposer restoring every field it
 * touched, or undefined when nothing could be taken over.
 *
 * 1. `candidates` → the picker's fuzzy + pinyin ranking. The official
 *    implementation is handed the live query and returns the **already mapped
 *    display items**, having filtered out everything its own matcher did not
 *    match — so a fuzzy query can never see the skills it needs. Asking it for
 *    an empty query returns the whole visible catalogue instead
 *    (`rankByName(items, "")` returns `items` verbatim), which is exactly the
 *    input the picker's ranking wants. The official visibility rules
 *    (userInvocable filtering, subagent-session exclusion, the "user only"
 *    label) are all applied before the list reaches us.
 * 2. `order` → the skill group sorts above the command group (the file patch
 *    used to rewrite `order: 2` to `-1`).
 * 3. `onPick` → records the pick, so a slash pick ranks as "recently used" in
 *    the ⚡ panel too.
 *
 * @param source - a live source object from the trigger registry.
 * @param hooks - { rank(items, query), order(number), onPick(name) }.
 * @returns a disposer, or undefined when nothing was taken over.
 */
export function wrapSkillSource(source, hooks = {}) {
  const { rank, order, onPick } = hooks
  if (source === null || typeof source !== 'object') return undefined
  if (isSkillSourceWrapped(source)) return undefined
  // A frozen or sealed source cannot take the wrapper, and a failed assignment
  // would throw out of `apply` and take the whole plugin (and the web shell)
  // down with it. Decline quietly instead; the file patch remains as fallback.
  if (Object.isFrozen(source)) return undefined

  const original = {
    candidates: source.candidates,
    order: source.order,
    hadOrder: Object.hasOwn(source, 'order'),
    onPick: source.onPick,
    hadOnPick: Object.hasOwn(source, 'onPick'),
  }
  const taken = []

  const wrappedCandidates = typeof rank === 'function' && typeof original.candidates === 'function'
    ? async function candidates(projection, args) {
        const options = args ?? {}
        const query = String(options.query ?? '').trim()
        const sessionId = projection?.sessionId
        const cacheKey = typeof sessionId === 'string' ? sessionId : undefined
        const cached = cacheKey === undefined ? undefined : itemCache.get(cacheKey)

        // Cache hit: return WITHOUT awaiting anything. The returned promise is
        // already resolved, so this group settles on the first microtask — ahead
        // of any group whose candidates awaits even a settled promise.
        if (cached !== undefined) {
          noteDiag({ mode: 'runtime', servedFromCache: true, sessionId: cacheKey, query })
          refreshCache(cacheKey, original.candidates, this, projection, options)
          if (query === '') return cached
          try {
            return rank(cached, query)
          } catch {
            return cached
          }
        }

        const everything = await original.candidates.call(this, projection, { ...options, query: '' })
        if (cacheKey !== undefined && Array.isArray(everything)) {
          // Store a SNAPSHOT, never the caller's array: the official source hands
          // back a container it may keep and grow, and aliasing it would make the
          // cache mutate underneath us.
          itemCache.set(cacheKey, everything.slice())
          noteDiag({ mode: 'runtime', servedFromCache: false, sessionId: cacheKey, primed: true, count: everything.length })
        }
        if (query === '' || !Array.isArray(everything)) return everything
        try {
          return rank(everything, query)
        } catch {
          // Ranking is an enhancement: a picker bug must never break the menu.
          return everything
        }
      }
    : undefined

  const wrappedPick = typeof onPick === 'function' && typeof original.onPick === 'function'
    ? function onPickWrapped(args) {
        try {
          const name = args?.candidate?.name
          if (typeof name === 'string') onPick(name)
        } catch {
          /* usage bookkeeping is best-effort */
        }
        return original.onPick.call(this, args)
      }
    : undefined

  try {
    Object.defineProperty(source, WRAPPED, { value: true, enumerable: false, configurable: true })
    if (wrappedCandidates !== undefined) {
      source.candidates = wrappedCandidates
      taken.push('candidates')
    }
    if (typeof order === 'number' && source.order !== order) {
      source.order = order
      taken.push('order')
    }
    if (wrappedPick !== undefined) {
      source.onPick = wrappedPick
      taken.push('onPick')
    }
  } catch {
    try {
      delete source[WRAPPED]
    } catch {
      /* nothing left to undo */
    }
    return undefined
  }

  if (taken.length === 0) {
    try {
      delete source[WRAPPED]
    } catch {
      /* nothing left to undo */
    }
    return undefined
  }

  enhancementMode = 'runtime'
  takenOverSource = source
  noteDiag({ mode: 'runtime', installed: true, took: taken.join('+') })
  // A Session may have asked to be primed before the takeover landed (the
  // picker mounts first, the takeover retries until the official source
  // registers); consume that request exactly once.
  if (pendingSessionId !== undefined) {
    const sessionId = pendingSessionId
    pendingSessionId = undefined
    primeNow(sessionId)
  }

  return () => {
    try {
      if (taken.includes('candidates')) source.candidates = original.candidates
      if (taken.includes('order')) {
        if (original.hadOrder) source.order = original.order
        else delete source.order
      }
      if (taken.includes('onPick')) {
        if (original.hadOnPick) source.onPick = original.onPick
        else delete source.onPick
      }
      delete source[WRAPPED]
      enhancementMode = undefined
      if (takenOverSource === source) takenOverSource = undefined
      // The cache deliberately SURVIVES a re-install: after a hot reload the
      // first menu open should still be served instantly instead of losing the
      // settle race once more.
      // A disposed takeover must not keep a priming request for a Session that
      // may be gone by the time it is installed again.
      pendingSessionId = undefined
    } catch {
      /* a source that became read-only keeps the wrapper; not fatal */
    }
  }
}

/**
 * Install the takeover, retrying while the official plugin has not registered
 * its source yet (both halves load during the same client boot, in an order the
 * picker does not control).
 *
 * @param inputTriggers - the injected service.
 * @param hooks - { rank, order, onPick } passed through to wrapSkillSource.
 * @param options - attempts (default 40) / intervalMs (default 250).
 * @returns a disposer that stops retrying and unwraps.
 */
export function installSlashFuzzy(inputTriggers, hooks = {}, options = {}) {
  const maxAttempts = options.attempts ?? 40
  const intervalMs = options.intervalMs ?? 250
  let restore
  let timer
  let attempts = 0
  let stopped = false

  const attempt = () => {
    if (stopped || restore !== undefined) return
    try {
      const source = findSkillSource(inputTriggers)
      if (source === undefined) {
        if (attempts++ < maxAttempts) {
          timer = setTimeout(attempt, intervalMs)
        } else {
          // Loud on the give-up case. The first release of this module reached
          // for a helper the service does not have and then quietly did nothing
          // for ten seconds; nobody could tell it had never run.
          noteDiag({ mode: 'none', gaveUp: true, attempts: maxAttempts })
          console.warn('[dsh-skill-picker] / takeover: the official "skill" trigger source was not found'
            + ` after ${maxAttempts} attempts — the / menu keeps the official matcher.`
            + ' See https://github.com/a735624258/dsh-skill-picker/issues/14')
        }
        return
      }
      // Already wrapped (a previous install, or an HMR re-apply): stop retrying
      // and leave the existing wrapper in place.
      restore = wrapSkillSource(source, hooks) ?? (() => {})
    } catch {
      // Never let the takeover attempt escape into the client boot.
      restore = () => {}
    }
  }

  attempt()

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    restore?.()
    restore = undefined
  }
}
