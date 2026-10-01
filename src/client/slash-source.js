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

/**
 * Locate the official skill source through the public `inputTriggers` service.
 *
 * `sources(trigger)` is the precise query; `all()` is the fallback for a kernel
 * that publishes the registry without the per-trigger helper. Both return the
 * live objects, so the caller can wrap `candidates` in place.
 *
 * @param inputTriggers - the injected service, if the host provided one.
 * @returns the source object, or undefined while it is not registered yet.
 */
export function findSkillSource(inputTriggers) {
  if (inputTriggers === null || inputTriggers === undefined) return undefined
  try {
    const byTrigger = typeof inputTriggers.sources === 'function' ? inputTriggers.sources(SKILL_SOURCE.trigger) : undefined
    const list = Array.isArray(byTrigger) && byTrigger.length > 0
      ? byTrigger
      : (typeof inputTriggers.all === 'function' ? inputTriggers.all() : undefined)
    if (!Array.isArray(list)) return undefined
    return list.find(
      (source) => source !== null && typeof source === 'object'
        && source.trigger === SKILL_SOURCE.trigger
        && source.name === SKILL_SOURCE.name,
    )
  } catch {
    return undefined
  }
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
        const everything = await original.candidates.call(this, projection, { ...options, query: '' })
        const query = String(options.query ?? '').trim()
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
        if (attempts++ < maxAttempts) timer = setTimeout(attempt, intervalMs)
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
