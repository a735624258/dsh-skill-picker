/**
 * Shared picker state — the pinned list and the usage history, kept in ONE place
 * instead of per browser origin.
 *
 * `localStorage` is scoped to an origin, so the desktop app (`dsh-app://app`),
 * the web UI (`http://127.0.0.1:3080`) and a phone each kept a private copy: pin
 * a skill on the desktop and the web UI never saw it. The host stores the list
 * once per DSH home (`$DSH_HOME/dsh-skill-picker-state.json`) and this module
 * mirrors it into `localStorage`.
 *
 * Why mirror instead of replacing `localStorage`: the ranking runs during render
 * and reads its inputs SYNCHRONOUSLY, so the data path has to stay synchronous.
 * The mirror keeps that true — the host copy is the source of truth, and
 * `localStorage` is the synchronous cache of it. Every local write is pushed
 * back, so both ends converge.
 *
 * Every function here is best-effort: a missing route or an offline host must
 * leave the picker working exactly as it did before, on local data alone.
 */

/** Same keys the panel reads synchronously. */
export const PINNED_KEY = 'dsh-skill-picker:pinned'
export const USAGE_KEY = 'dsh-skill-picker:usage'

/**
 * Set once this browser has completed a sync against the shared file.
 *
 * The first sync of a browser that already had pins MUST union instead of
 * adopting: whichever client happens to boot first would otherwise overwrite
 * the file, and the next client would adopt that and silently lose its own
 * pins. After the first sync this browser follows the file, so a pin removed
 * on one client really disappears from the others.
 */
const SYNCED_KEY = 'dsh-skill-picker:shared-synced'

/** Host route (same origin as the GUI in both the desktop app and the web UI). */
const ENDPOINT = '/dsh-skill-picker/state'

/** Fired after a pull changes the mirror, so open surfaces re-read it. */
export const SHARED_STATE_EVENT = 'dsh-skill-picker:shared-state'

/** Read the mirrored pinned list; never throws. */
function readLocalPinned() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

/** Read the mirrored usage history; never throws. */
function readLocalUsage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Write the mirror; never throws. */
function writeLocal(state) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(state?.pinned ?? []))
    localStorage.setItem(USAGE_KEY, JSON.stringify(state?.usage ?? {}))
  } catch {
    /* storage unavailable — the host copy is still authoritative */
  }
}

/** Whether a state object carries anything worth adopting. */
function isEmptyState(state) {
  if (state === null || state === undefined || typeof state !== 'object') return true
  const pinned = Array.isArray(state.pinned) ? state.pinned : []
  const usage = state.usage !== null && typeof state.usage === 'object' ? state.usage : {}
  return pinned.length === 0 && Object.keys(usage).length === 0
}

/** Whether this browser has ever completed a sync. */
function hasSynced() {
  try {
    return localStorage.getItem(SYNCED_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember that this browser is now following the shared file. */
function markSynced() {
  try {
    localStorage.setItem(SYNCED_KEY, '1')
  } catch {
    /* private mode: it simply unions again next time, which is the safe side */
  }
}

/** Push the local mirror to the shared file.
 *
 * @param options.migrate - first-run mode: the host unions the incoming state
 *   with whatever is already stored (instead of overwriting it) and returns the
 *   result, which is then adopted locally. Use it only when the shared file is
 *   known to be absent.
 * @returns whether the host accepted the write.
 */
export async function pushSharedState({ migrate = false } = {}) {
  try {
    const response = await fetch(`${ENDPOINT}${migrate ? '?migrate=1' : ''}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: readLocalPinned(), usage: readLocalUsage() }),
    })
    if (!response.ok) return false
    const body = await response.json()
    if (body?.ok !== true) return false
    if (migrate) writeLocal(body.state)
    return true
  } catch {
    return false
  }
}

/**
 * Pull the shared file into the local mirror.
 *
 * When this browser has never synced before and already holds pins/usage, the
 * pull goes through the UNIONING migration instead of a plain adopt — otherwise
 * whichever client boots first overwrites the file and the next one silently
 * loses its own pins. Once a browser has synced, it follows the file, so a pin
 * removed on another client really disappears here too.
 *
 * @returns whether the mirror was refreshed from the host.
 */
export async function pullSharedState() {
  try {
    const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
    if (!response.ok) return false
    const body = await response.json()
    if (body?.ok !== true) return false

    const localHasData = !isEmptyState({ pinned: readLocalPinned(), usage: readLocalUsage() })

    // Nothing shared yet: this browser seeds it.
    if (body.state === null || body.state === undefined) {
      const pushed = await pushSharedState({ migrate: true })
      if (pushed) markSynced()
      return true
    }

    // First sync on a browser that has its own data: union, never overwrite.
    if (!hasSynced() && localHasData) {
      const pushed = await pushSharedState({ migrate: true })
      if (pushed) {
        markSynced()
        return true
      }
    }

    // The shared file exists but is empty, and this browser is the only one
    // still holding data: push it rather than blanking the mirror.
    if (isEmptyState(body.state) && localHasData) {
      const pushed = await pushSharedState({ migrate: true })
      if (pushed) markSynced()
      return true
    }

    writeLocal(body.state)
    markSynced()
    return true
  } catch {
    return false
  }
}

/**
 * Pull, then tell open surfaces to re-read the mirror.
 * @returns whether anything was pulled.
 */
export async function syncSharedState() {
  const pulled = await pullSharedState()
  if (pulled) {
    try {
      window.dispatchEvent(new Event(SHARED_STATE_EVENT))
    } catch {
      /* an environment without window cannot have listeners either */
    }
  }
  return pulled
}
