/**
 * dsh-skill-picker — host half: exposes the installed-skill catalog to the
 * browser half through a small JSON route (`/dsh-skill-picker/skills`) and
 * announces the picker to every agent through the system-prompt section
 * mechanism.
 *
 * The catalog is scanned directly from the DSH user skills directory
 * (`$DSH_HOME/skills`, default `~/.dsh/skills`) by reading each skill's
 * `SKILL.md` frontmatter. Why not `ctx.skills`? The filesystem skill provider
 * is mounted in agent scope (the standard preset's standing mount), so a
 * host-context `ctx.skills.snapshot({})` sees only the global layer — which
 * is empty for user skills. Scanning the same roots the provider uses keeps
 * the picker's list in sync with what agents actually load.
 *
 * The browser half (exports "./client") is served by client-modules from the
 * same package's dsh.client declaration.
 *
 * @module dsh-skill-picker
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isDirectoryEntry } from './dir-entry.js'
import { dshHome, healUiSkillPatches, revertUiSkillPatches } from './patch-ui-skill.js'
import {
  CLIENT_HEADER,
  DISABLED_ENTRY,
  ENTRY,
  listSkillBackups,
  resolveSkillPath,
  restoreSkillBackup,
  revealSkill,
  setSkillDisabled,
  uninstallSkill,
} from './skill-ops.js'

/** Required services: the route registry and the prompt band. */
export const inject = ['webServer', 'systemPrompt']

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215

/** Model-facing announcement: picker presence and the user-visible gesture. */
export const SKILL_PICKER_GUIDANCE =
  '本机已安装 dsh-skill-picker 插件（Web GUI 的技能选择器）：输入框旁有技能按钮，用户点选技能后会把 `/技能名`（如 /duo-xuan-pi-gai）插入发送框并随消息发出。DSH 官方机制会把用户消息里的 `/技能名` 手势当作技能直接调用并自动加载技能内容——你照常按加载后的技能指令执行即可，无需额外操作。用户说「技能选择器 / 选个技能 / 技能列表」时即指本插件。'

/** Resolve the user skills directory, mirroring the official provider's default. */
function userSkillsDir() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'skills')
}

/**
 * Resolve the user agents-home skills directory, mirroring the official
 * provider's default (`$DSH_AGENTS_HOME` > `~/.agents`). This is the
 * cross-tool `.agents` convention; the official `dsh-skill-filesystem` scans
 * it as its `user-agents` root (rank 500), so the fallback must too — else
 * the picker's list silently misses skills that DSH's own `/` completion
 * shows (issue #5).
 */
function userAgentsSkillsDir() {
  const agentsHome = process.env.DSH_AGENTS_HOME ?? path.join(os.homedir(), '.agents')
  return path.join(agentsHome, 'skills')
}

/** The YAML frontmatter block of a SKILL.md body, or undefined when absent. */
function frontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return match === null ? undefined : match[1]
}

/** Parse a SKILL.md frontmatter block into a key/value map (flat YAML subset). */
function parseFrontmatter(content) {
  const block = frontmatterBlock(content)
  if (block === undefined) return {}
  const out = {}
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const value = kv[2].trim().replace(/^["']|["']$/g, '')
    if (value !== '') out[kv[1]] = value
  }
  return out
}

/**
 * Whether the frontmatter carries `key` at all, whatever its value.
 * `parseFrontmatter` drops empty values, so presence checks that must also
 * see a bare `key:` line go through here instead.
 */
function hasFrontmatterKey(content, key) {
  const block = frontmatterBlock(content)
  if (block === undefined) return false
  return block.split(/\r?\n/).some((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    return kv !== null && kv[1] === key
  })
}

/**
 * Legacy invocation spellings the official `dsh-skill-filesystem` provider
 * rejects outright (`rejectLegacyInvocationKey`) — a skill carrying one is
 * dropped from every surface, so the picker must drop it too.
 */
const LEGACY_INVOCATION_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable']

/**
 * Read a frontmatter boolean with the official provider's semantics: YAML
 * booleans plus the case-insensitive `true`/`false`, `yes`/`no`, `on`/`off`
 * and `1`/`0` forms. An absent key yields undefined ("surface permitted").
 */
function frontmatterBoolean(meta, key) {
  if (!Object.hasOwn(meta, key)) return undefined
  const value = meta[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

/**
 * Whether a scanned skill may be offered by the picker, i.e. whether it is
 * user-invocable. Mirrors `parseInvocationPolicy` in
 * `@deepseek-ai/dsh-skill-filesystem`: `user-invocable: false` keeps the skill
 * out of human-facing commands, a rejected spelling or a legacy invocation key
 * drops it entirely.
 *
 * Why this exists (issue #10): the official `skills/list` Remote filters with
 * `isUserInvocable` before answering, but this host's own fallback scan read
 * name/description only — so the picker offered skills the official `/` menu
 * hides, and picking one inserted a `/name` gesture that `dsh-tool-skill` then
 * refused to load (a silent no-op).
 *
 * @param meta - parsed frontmatter map.
 * @param content - the raw SKILL.md body (legacy keys are detected on it).
 */
function isUserInvocableSkill(meta, content) {
  for (const legacy of LEGACY_INVOCATION_KEYS) {
    if (hasFrontmatterKey(content, legacy)) return false
  }
  try {
    // Omitted → permitted; only an explicit `false` hides the skill.
    return frontmatterBoolean(meta, 'user-invocable') !== false
  } catch {
    return false
  }
}

/** Scan one skill directory into the map; never throws (missing dir is a no-op). */
async function scanSkillsDirInto(map, dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // Links are followed (`isDirectoryEntry`), so a skill may live behind a
    // symlink/junction — e.g. `~/.agents/skills/neat` → another repo (#6).
    if (!(await isDirectoryEntry(dir, entry))) continue
    const skillDir = path.join(dir, entry.name)
    let content
    let entryFile = ENTRY
    let disabled = false
    try {
      content = await readFile(path.join(skillDir, ENTRY), 'utf8')
    } catch {
      // A disabled skill keeps its entry under a different name, which the
      // official provider ignores entirely. The panel still has to list it, or
      // there would be no way to switch it back on.
      try {
        content = await readFile(path.join(skillDir, DISABLED_ENTRY), 'utf8')
        entryFile = DISABLED_ENTRY
        disabled = true
      } catch {
        continue
      }
    }
    const meta = parseFrontmatter(content)
    // The picker is a human-facing surface, so honour the invocation policy:
    // `user-invocable: false` (and the legacy spellings the official provider
    // rejects) must never be offered. The official `skills/list` Remote filters
    // the same way — without this the fallback route listed skills that the
    // official `/` menu hides and that the `/name` gesture then refuses to load
    // (issue #10).
    if (!isUserInvocableSkill(meta, content)) continue
    // Later writes win, so project-level skills override same-named user skills.
    map.set(meta.name ?? entry.name, {
      name: meta.name ?? entry.name,
      description: meta.description ?? '',
      path: skillDir,
      entry: entryFile,
      disabled,
    })
  }
}

/**
 * Scan the same roots the official `dsh-skill-filesystem` provider uses, so
 * the fallback route stays in sync with what agents actually load:
 * project `.dsh/skills` (rank 100) > project `.agents/skills` (200) >
 * user `~/.dsh/skills` (400) > user `~/.agents/skills` (500). Scanned
 * low-priority first, so later writes (higher priority) win in the map.
 * Never throws (a missing dir yields []).
 * @param cwd - the active session's workspace root (undefined = user level only).
 * @returns the deduplicated, name-sorted skill list.
 */
export async function scanSkills(cwd) {
  const map = new Map()
  await scanSkillsDirInto(map, userAgentsSkillsDir())
  await scanSkillsDirInto(map, userSkillsDir())
  if (typeof cwd === 'string' && cwd !== '') {
    await scanSkillsDirInto(map, path.join(cwd, '.agents', 'skills'))
    await scanSkillsDirInto(map, path.join(cwd, '.dsh', 'skills'))
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Decide what (if anything) the ui-skill self-heal patch should say on boot
 * (issue #8).
 *
 * `healUiSkillPatches()` reports **every target file it found**, whether or not
 * this boot changed it. Keying the log off `report.files.length` therefore
 * printed a report-shaped JSON line on *every* start — even when the patches
 * were already up to date — which reads like a warning and buries the lines
 * that really matter. Speak up only when there is something to say:
 *
 *   - `noop`    → an anchor did not match: the official implementation moved and
 *                 the enhancement is NOT applied. Always a warning (this is the
 *                 same class of silent failure as issue #7).
 *   - `patched` → this boot really rewrote a file: one report line.
 *   - `errors`  → I/O failures: one warning (folded into the report line when a
 *                 patch also succeeded, so a single line carries both).
 *   - none      → silent: the install is already up to date.
 *
 * Set `DSH_SKILL_PICKER_LOG=debug` for the full report including `skipped`.
 *
 * Exported for tests; `io` is injectable so they can capture the output.
 *
 * @param {{files?: Array, errors?: string[]}} report - result of healUiSkillPatches().
 * @param {Pick<Console, 'log' | 'warn'>} [io] - sinks (defaults to the console).
 */
export function reportUiSkillPatches(report, io = console) {
  const files = report?.files ?? []
  const errors = report?.errors ?? []
  // An anchor miss means the enhancement silently did not apply — never bury it.
  const stale = files.filter((file) => file.noop.length > 0)
  if (stale.length > 0) {
    io.warn('[dsh-skill-picker] ui-skill patch: anchors not found, enhancement NOT applied '
      + '(the official implementation likely changed):', JSON.stringify(stale))
  }
  const changed = files.filter((file) => file.patched.length > 0)
  // Read per call so the switch also works when set by tests or a wrapper.
  const debug = process.env.DSH_SKILL_PICKER_LOG === 'debug'
  if (debug) {
    io.log('[dsh-skill-picker] ui-skill patch report (debug):', JSON.stringify({ files, errors }))
  } else if (changed.length > 0) {
    // Only the files this boot actually touched, plus every error.
    io.log('[dsh-skill-picker] ui-skill patch report:', JSON.stringify({ files: changed, errors }))
  } else if (errors.length > 0) {
    io.warn('[dsh-skill-picker] ui-skill patch errors:', JSON.stringify(errors))
  }
}

/**
 * Shared picker state: the pinned list and the usage history, stored ONCE per
 * DSH home instead of per browser origin.
 *
 * Why it exists: `localStorage` is scoped to an origin, so the desktop app
 * (`dsh-app://app`), the web UI (`http://127.0.0.1:3080`) and a phone all kept
 * their own copy — pin a skill on the desktop and the web UI never sees it.
 * Both halves now read and write this one file.
 *
 * @returns the absolute path of the shared state file.
 */
function sharedStateFile() {
  return path.join(dshHome(), 'dsh-skill-picker-state.json')
}

/** Coerce anything into `{ pinned: string[], usage: {name: {count, lastUsed}} }`. */
function normalizeSharedState(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const pinned = Array.isArray(source.pinned)
    ? [...new Set(source.pinned.filter((name) => typeof name === 'string' && name !== ''))]
    : []
  const usage = {}
  const rawUsage = source.usage !== null && typeof source.usage === 'object' ? source.usage : {}
  for (const [name, entry] of Object.entries(rawUsage)) {
    if (typeof name !== 'string' || name === '') continue
    const record = entry !== null && typeof entry === 'object' ? entry : {}
    const count = Number.isFinite(record.count) ? Math.max(0, Math.trunc(record.count)) : 0
    const lastUsed = Number.isFinite(record.lastUsed) ? Math.max(0, Math.trunc(record.lastUsed)) : 0
    if (count === 0 && lastUsed === 0) continue
    usage[name] = { count, lastUsed }
  }
  return { pinned, usage }
}

/** Read the shared state, or null when the file does not exist yet. */
async function readSharedState() {
  try {
    return normalizeSharedState(JSON.parse(await readFile(sharedStateFile(), 'utf8')))
  } catch {
    return null
  }
}

/** Write the shared state atomically (temp + rename), creating the home if needed. */
async function writeSharedState(state) {
  const normal = normalizeSharedState(state)
  const file = sharedStateFile()
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify(normal, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
  return normal
}

/**
 * First-run migration: union both ends instead of letting whichever browser
 * happened to write first win, so nobody silently loses their pins.
 */
function mergeSharedState(a, b) {
  const left = normalizeSharedState(a)
  const right = normalizeSharedState(b)
  const pinned = [...left.pinned]
  for (const name of right.pinned) if (!pinned.includes(name)) pinned.push(name)
  const usage = { ...left.usage }
  for (const [name, entry] of Object.entries(right.usage)) {
    const previous = usage[name]
    usage[name] = previous === undefined
      ? entry
      : { count: Math.max(previous.count, entry.count), lastUsed: Math.max(previous.lastUsed, entry.lastUsed) }
  }
  return normalizeSharedState({ pinned, usage })
}

/** Read a JSON request body with a hard cap, so a bad client cannot grow memory. */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1_000_000) throw new Error('shared state body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/**
 * `GET /dsh-skill-picker/state` → `{ ok, state }` (`state: null` before the
 * first write). `PUT` with `{ pinned, usage }` → the stored state; `?migrate=1`
 * unions the incoming state with the stored one and returns the result.
 */
async function handleSharedState(req, res, url) {
  const json = (code, payload) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  }
  try {
    if (req.method === 'PUT' || req.method === 'POST') {
      const incoming = normalizeSharedState(await readJsonBody(req))
      const migrate = url.searchParams.get('migrate') === '1'
      const stored = migrate ? await readSharedState() : null
      const next = stored === null ? await writeSharedState(incoming) : await writeSharedState(mergeSharedState(stored, incoming))
      json(200, { ok: true, state: next })
      return
    }
    json(200, { ok: true, state: await readSharedState() })
  } catch (error) {
    json(500, { ok: false, error: String(error?.message ?? error) })
  }
}

/**
 * Every root a skill may live in, in the order the scanner reads them.
 * Single source of truth: `skill-ops` must not re-derive these.
 */
function allSkillRoots(cwd) {
  const roots = [userAgentsSkillsDir(), userSkillsDir()]
  if (typeof cwd === 'string' && cwd !== '') {
    roots.push(path.join(cwd, '.agents', 'skills'), path.join(cwd, '.dsh', 'skills'))
  }
  return roots
}

/**
 * `POST /dsh-skill-picker/skill` — disable / enable / reveal / uninstall /
 * restore a skill, and list the uninstall backups.
 *
 * Three guards, in order:
 *
 *  1. The request must carry `x-dsh-skill-picker: 1`. Plugin routes bypass the
 *     web server's auth gate (they are reachable without a cookie), and these
 *     actions rename and move files. A cross-site `fetch` cannot set a custom
 *     header without a CORS preflight the host does not answer, so this header
 *     is what keeps an arbitrary web page out.
 *  2. The target path must resolve inside a known skill root. Anything else —
 *     the root itself, a file nested inside a skill, `../..`, or an absolute
 *     path elsewhere — is refused before any filesystem call.
 *  3. Nothing is ever deleted. "Uninstall" moves the skill into
 *     `$DSH_HOME/skill-backups/` beside a manifest, and `restore` moves it back.
 */
async function handleSkillOp(req, res, url) {
  const json = (code, payload) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(payload))
  }
  if (req.method !== 'POST') {
    json(405, { ok: false, error: 'POST only' })
    return
  }
  if (req.headers[CLIENT_HEADER] !== '1') {
    json(403, { ok: false, error: 'missing client header' })
    return
  }
  try {
    const body = await readJsonBody(req)
    const cwd = url.searchParams.get('cwd') ?? undefined
    const roots = allSkillRoots(cwd)
    const action = String(body?.action ?? '')

    if (action === 'backups') {
      json(200, { ok: true, backups: await listSkillBackups(roots) })
      return
    }
    if (action === 'restore') {
      json(200, { ok: true, ...(await restoreSkillBackup(body?.id, roots)) })
      return
    }

    // Resolve by NAME through the host's own scan, never by a path the browser
    // supplied: the panel's primary source is the official `skills/list` RPC,
    // whose DTO is not guaranteed to carry a filesystem path — and a name the
    // host looks up itself cannot point outside the skill roots at all.
    const name = String(body?.name ?? '')
    if (name === '') {
      json(400, { ok: false, error: 'name is required' })
      return
    }
    const known = (await scanSkills(cwd)).find((skill) => skill.name === name)
    if (known === undefined) {
      json(404, { ok: false, error: `no skill named "${name}"` })
      return
    }
    const target = resolveSkillPath(known.path, roots)
    if (target === undefined) {
      json(403, { ok: false, error: 'that skill lives outside the skill roots' })
      return
    }

    if (action === 'disable') {
      json(200, { ok: true, ...(await setSkillDisabled(target, true)) })
      return
    }
    if (action === 'enable') {
      json(200, { ok: true, ...(await setSkillDisabled(target, false)) })
      return
    }
    if (action === 'reveal') {
      json(200, { ok: true, revealed: revealSkill(target) })
      return
    }
    if (action === 'uninstall') {
      json(200, { ok: true, ...(await uninstallSkill(target)) })
      return
    }
    json(400, { ok: false, error: `unknown action: ${action}` })
  } catch (error) {
    json(500, { ok: false, error: String(error?.message ?? error) })
  }
}

/**
 * Mount the skills route and the prompt section.
 * @param ctx - context carrying webServer and systemPrompt.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const handler = async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://dsh')
        if (url.pathname === '/dsh-skill-picker/state') {
          await handleSharedState(req, res, url)
          return
        }
        if (url.pathname === '/dsh-skill-picker/skill') {
          await handleSkillOp(req, res, url)
          return
        }
        // cwd query carries the active session's workspace root from the client.
        const cwd = url.searchParams.get('cwd') ?? undefined
        const skills = await scanSkills(cwd)
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, complete: true, skills }))
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
      }
    }
    return ctx.webServer.register({ kind: 'prefix', path: '/dsh-skill-picker', handler })
  }, 'dsh-skill-picker: routes')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:skill-picker',
    order: SECTION_ORDER,
    text: SKILL_PICKER_GUIDANCE,
  }), 'dsh-skill-picker: prompt section')

  // The `/` enhancement no longer edits official files.
  //
  // Since v0.5.15 it takes over the LIVE trigger source at runtime, which does
  // everything the old file patch did (skill group first, fuzzy+pinyin matching,
  // usage tracking) without touching a single file. The patch is therefore
  // redundant — and a modified copy of an official package is confusing in its
  // own right: it made the desktop and web profiles disagree about one shared
  // file, and it is what made "is this the original?" impossible to answer.
  //
  // So the default is now to RESTORE our own patch (from the `.bak` it made).
  // Set DSH_SKILL_PICKER_FILE_PATCH=1 to fall back to the old behaviour on a
  // kernel whose trigger registry has no live sources to take over.
  ctx.effect(() => {
    const enabled = process.env.DSH_SKILL_PICKER_FILE_PATCH === '1'
    const task = enabled
      ? healUiSkillPatches().then((report) => reportUiSkillPatches(report))
      : revertUiSkillPatches().then((report) => {
        if (report.restored.length > 0) {
          console.log('[dsh-skill-picker] ui-skill patch retired; restored original file(s):',
            report.restored.join(', '))
        }
        if (report.errors.length > 0) {
          console.warn('[dsh-skill-picker] ui-skill restore errors:', JSON.stringify(report.errors))
        }
      })
    task.catch((error) => {
      console.warn('[dsh-skill-picker] ui-skill patch failed:', error)
    })
    return () => {}
  }, 'dsh-skill-picker: ui-skill self-heal patch')
}
