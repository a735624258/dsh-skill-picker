/**
 * dsh-skill-picker — browser half: mounts a skill-picker control into the
 * composer's right tool row (`conversation.input.right` list slot, the seat
 * just before the send button). Clicking it opens a searchable list of
 * installed skills (fetched from the host route `/dsh-skill-picker/skills`),
 * ordered by usage: recently picked first, then frequently used, then the
 * untouched rest (by name). Picking one inserts the official `/skill-name`
 * gesture into the draft via the framework input machine
 * (`inputActions.setDraft`), so DSH's native user-invocation path loads the
 * skill with the message.
 *
 * All DOM/runtime wiring failures are logged, never thrown — the web shell
 * fails the whole boot when a plugin apply throws.
 *
 * @module dsh-skill-picker/client
 */

import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import fuzzysort from 'fuzzysort'
import { pinyin } from 'pinyin-pro'

import { sessionIdOf, useWorkspaceCwd } from './session-view.js'
import { SHARED_STATE_EVENT, pushSharedState, syncSharedState } from './shared-state.js'
import { installSlashFuzzy, slashEnhancementMode, warmSlashSkill } from './slash-source.js'

/** Required services: slot registry, host connection (official skills API), sessions (workspace cwd fallback), input triggers (/ fuzzy source). */
export const inject = ['slots', 'connection', 'sessions', 'inputTriggers']

/** localStorage key for the picker's per-browser usage history. */
const USAGE_KEY = 'dsh-skill-picker:usage'

/** localStorage key for the user's manually pinned skills (ordered array of names). */
const PINNED_KEY = 'dsh-skill-picker:pinned'

/** Read the pinned list {string[]}; never throws. */
function loadPinned() {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

/** Persist the pinned list; never throws. Also pushes the shared copy. */
function savePinned(pinned) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinned))
  } catch {
    /* storage unavailable — pinning just won't persist */
  }
  void pushSharedState()
}

/** Read the usage history {name: {count, lastUsed}}; never throws. */
function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist the usage history; never throws. Also pushes the shared copy. */
function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  } catch {
    /* storage unavailable — ordering just won't persist */
  }
  void pushSharedState()
}

/**
 * Manage one skill through the host: disable / enable / reveal / uninstall /
 * restore.
 *
 * The request carries `x-dsh-skill-picker: 1` on purpose. Plugin routes are
 * reachable without authentication (`/` needs a token, these do not), and these
 * actions rename and move files — so they require a header that a cross-site
 * form POST cannot set. See `handleSkillOp` in the host half.
 *
 * @param action - disable | enable | reveal | uninstall | restore | backups
 * @param payload - { name } for skill actions, { id } for restore.
 * @returns `{ ok, error?, ... }` — never throws.
 */
async function skillOp(action, payload = {}) {
  try {
    const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? `?cwd=${encodeURIComponent(payload.cwd)}` : ''
    const response = await fetch(`/dsh-skill-picker/skill${cwd}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-skill-picker': '1' },
      body: JSON.stringify({ action, ...payload }),
    })
    const body = await response.json().catch(() => undefined)
    if (body === undefined || body.ok !== true) {
      return { ok: false, error: body?.error ?? `host returned ${response.status}` }
    }
    return body
  } catch (cause) {
    return { ok: false, error: String(cause?.message ?? cause) }
  }
}

/**
 * Hand the caret back to the composer after a pick, at the END of the text.
 *
 * Picking from this panel used to leave the input filled but WITHOUT a caret:
 * the click focused the row, the panel then unmounted, and focus fell back to
 * the body — so the user had to click the input again before typing. Picking
 * from the official `/` menu never has that problem, because the composer keeps
 * focus there. 用户 reported exactly this difference.
 *
 * The first fix focused the editor but stopped there, and the caret landed at
 * the START of the line: focusing a `contenteditable` with no selection is
 * specified to put the caret at the beginning. So the caret is seated
 * explicitly here.
 *
 * Seating a collapsed Range at the end is deliberately the *same* thing a click
 * at the end of the line does, which is how the official editor normally
 * receives a caret — it syncs its internal selection from the DOM. Merely
 * calling `setDraft` again would not help: it early-returns when the text is
 * unchanged, so the caret would never move.
 *
 * Best-effort: a failure here must never break the pick itself.
 *
 * @param from - a node inside the composer (our own button).
 * @param onlyIfFocused - re-seat the caret only when the composer already holds
 *   focus. Used by the delayed second call, so a fast click somewhere else is
 *   never overridden.
 * @returns whether an editor was found and focused.
 */
function focusComposer(from, onlyIfFocused = false) {
  try {
    let node = from
    for (let depth = 0; depth < 8 && node !== null && node !== undefined; depth += 1) {
      const editor = typeof node.querySelector === 'function'
        ? node.querySelector('[contenteditable="true"], textarea')
        : null
      if (editor !== null && editor !== undefined) {
        if (onlyIfFocused && document.activeElement !== editor) return false
        if (typeof editor.focus === 'function') editor.focus()
        try {
          if (editor.isContentEditable === true) {
            const range = document.createRange()
            range.selectNodeContents(editor)
            range.collapse(false)
            const selection = window.getSelection()
            if (selection !== null && selection !== undefined) {
              selection.removeAllRanges()
              selection.addRange(range)
            }
          } else if (typeof editor.setSelectionRange === 'function') {
            const end = String(editor.value ?? '').length
            editor.setSelectionRange(end, end)
          }
        } catch {
          /* the focus alone is still an improvement over no caret at all */
        }
        return true
      }
      node = node.parentElement
    }
  } catch {
    /* focus is a convenience, never a requirement */
  }
  return false
}

/**
 * Whether a skill entry may be offered by a human-facing surface (this panel
 * and the `/` completion it feeds). The official `skills/list` DTO
 * (`SkillEntry`) carries only `modelInvocable` — the host has already filtered
 * user-invocable skills out of it — but the registry summary nests both flags
 * under `invocation`. Accept either shape and hide only an explicit `false`,
 * so an omitted flag keeps the historical behaviour (issue #10).
 */
function isUserFacingSkill(skill) {
  const flag = skill?.userInvocable ?? skill?.invocation?.userInvocable
  return flag !== false
}

/**
 * Shared usage ordering — the single rule used by BOTH the ⚡ panel and the
 * `/` completion: last picked first, then most frequent, then by name.
 * A fresh copy is returned; the input array is untouched.
 */
function rankByUsage(skills, usage) {
  return skills.slice().sort((a, b) => {
    const ua = usage[a.name]
    const ub = usage[b.name]
    const la = ua?.lastUsed ?? 0
    const lb = ub?.lastUsed ?? 0
    if (la !== lb) return lb - la
    const ca = ua?.count ?? 0
    const cb = ub?.count ?? 0
    if (ca !== cb) return cb - ca
    return a.name.localeCompare(b.name)
  })
}

/**
 * Grouped ordering for the ⚡ panel: pinned (manual, pinned order) first,
 * then recently/frequently used (usage order), then the untouched rest (by
 * name). Groups with no members are dropped. A fresh structure is returned;
 * the input arrays are untouched.
 */
function groupByPinned(skills, usage, pinned) {
  const pinnedSet = new Set(pinned)
  const pinnedList = pinned.map((name) => skills.find((s) => s.name === name)).filter(Boolean)
  const ranked = rankByUsage(skills, usage)
  const recent = []
  const rest = []
  for (const skill of ranked) {
    if (pinnedSet.has(skill.name)) continue
    if (usage[skill.name] !== undefined) recent.push(skill)
    else rest.push(skill)
  }
  return [
    // Plain titles, no emoji: these are section headings, and DSH's own
    // headings (侧栏的「工作区」/「会话」) are plain text. 用户: "加图标，那前面
    // 一团火，这种图标看着不像 DSH 的风格".
    { title: '置顶', items: pinnedList },
    { title: '最近使用', items: recent },
    { title: '全部', items: rest },
  ].filter((group) => group.items.length > 0)
}

/**
 * Pinyin search text for a skill name/description: spaced full pinyin
 * (`ji yi`), joined (`jiyi`), and initials (`jy`) for the name, plus joined
 * full pinyin and initials for the description — so either the `/` fuzzy
 * completion or the ⚡ panel matches queries like `ji yi`, `jiyi`, or `jy`
 * against 记忆/知识库/每日打卡-ish Chinese text. Cached per (name, desc)
 * pair; never throws (falls back to '').
 */
const pinyinCache = new Map()
function skillPinyinText(name, description = '') {
  const key = `${name}\u0000${description}`
  const cached = pinyinCache.get(key)
  if (cached !== undefined) return cached
  let text = ''
  try {
    const base = { toneType: 'none', nonZh: 'consecutive' }
    const nameSpaced = pinyin(name, base)
    const nameJoined = pinyin(name, { ...base, separator: '' })
    const nameFirstSpaced = pinyin(name, { ...base, pattern: 'first' })
    const nameFirstJoined = pinyin(name, { ...base, pattern: 'first', separator: '' })
    const descSpaced = pinyin(description, base)
    const descJoined = pinyin(description, { ...base, separator: '' })
    const descFirstSpaced = pinyin(description, { ...base, pattern: 'first' })
    const descFirstJoined = pinyin(description, { ...base, pattern: 'first', separator: '' })
    text = `${nameSpaced} ${nameJoined} ${nameFirstSpaced} ${nameFirstJoined} ${descSpaced} ${descJoined} ${descFirstSpaced} ${descFirstJoined}`
  } catch {
    text = ''
  }
  pinyinCache.set(key, text)
  return text
}

/**
 * Search relevance rank for the ⚡ panel (and any exact-match filtering):
 * 0 = name starts with the query, 1 = name contains it, 2 = description
 * contains it, 3 = pinyin text contains it, 4 = no match (filtered out).
 * Lower is more relevant; the panel keeps the pinned/usage order as the
 * tiebreak within the same rank, so a name-exact skill like svg-diagram
 * surfaces above merely-used-but-vaguely-matching ones.
 */
function matchRank(skill, q) {
  const name = skill.name.toLowerCase()
  const desc = String(skill.description ?? '').toLowerCase()
  const py = skillPinyinText(skill.name, skill.description ?? '').toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if (desc.includes(q)) return 2
  if (py.includes(q)) return 3
  return 4
}

/**
 * The picker's single ranking rule, shared by the ⚡ panel, the legacy `/`
 * matcher and the runtime `/` takeover (issue #14) so the two lists can never
 * disagree about matching OR order.
 *
 * Only `name` and `description` are read, which is what both raw skill entries
 * and the official menu's already-mapped display items carry.
 *
 * Relevance first (name-startsWith > name-contains > description > pinyin),
 * then the ⚡ panel's pinned/usage order as the tiebreak — fuzzysort decides
 * WHO matches, never the display order. Pure subsequence noise (dispersed
 * letters that never form an actual substring) is dropped.
 *
 * @param items - [{ name, description }]
 * @param query - the raw query string.
 * @returns the ranked subset (all items, in panel order, for an empty query).
 */
function rankPickerItems(items, query) {
  const ordered = groupByPinned(
    Array.isArray(items) ? items : [],
    loadUsage(),
    loadPinned(),
  ).flatMap((group) => group.items)
  const q = String(query ?? '').trim().toLowerCase()
  if (q === '') return ordered
  const order = new Map(ordered.map((skill, index) => [skill.name, index]))
  const targets = ordered.map((s) => ({
    s,
    search: `${s.name} ${s.description ?? ''} ${skillPinyinText(s.name, s.description ?? '')}`,
  }))
  return fuzzysort.go(q, targets, {
    key: 'search',
    limit: 30,
    threshold: -10000,
  })
    .filter((r) => r.score > 0)
    .map((r) => r.obj.s)
    .filter((s) => matchRank(s, q) < 4)
    .sort((a, b) => matchRank(a, q) - matchRank(b, q) || (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0))
}

/** Row height matches the resident chrome (access mode, plan, attach, model). */
const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  margin: '0 2px',
  padding: '0',
  border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, #c9d2e0)',
  cursor: 'pointer',
  fontSize: '15px',
  lineHeight: '1',
  flex: 'none',
}

/**
 * DSH's own UI font, so the panel reads as part of the harness rather than as a
 * bolted-on popup.
 *
 * The skill NAME used to be rendered in `--ds-font-family-code` (the monospace
 * face) because a `/skill` reads like a command — 用户 spotted it immediately:
 * "我想你用和右下角选择模型里的英文和中文一样的字体". The model picker uses
 * `--dsw-font-family`, so that is what everything here uses now, and the sizes
 * follow the composer (14px / 24px) instead of the browser's default button size
 * (13.3333px), which is what the rows had been falling back to.
 */
const FONT_FAMILY = 'var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif)'

/**
 * Panel placement.
 *
 * Fixed (not absolute) and anchored to the RIGHT EDGE OF THE WINDOW, with the
 * vertical offset measured from the ⚡ button so it still opens just above the
 * composer.
 *
 * Why not `absolute; right: 0` on the button's own wrapper — which is what it
 * used to be: the ⚡ sits next to the model picker, well left of the composer's
 * right edge, so the panel was right-aligned to *that* and threw itself across
 * the middle of the conversation, covering the text. 用户 spotted it.
 */
const popoverStyle = {
  position: 'fixed',
  right: '24px',
  width: '340px',
  maxHeight: '320px',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--dsw-specific-tip, #1e2533)',
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
  borderRadius: '12px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  overflow: 'hidden',
  zIndex: 1000,
  fontFamily: FONT_FAMILY,
  fontSize: '14px',
  lineHeight: '24px',
}

/**
 * The search field, styled like the composer's own pickers.
 *
 * 用户: "我这个搜索框能不能变成这个模型搜索的样式？我感觉确实可以跟 DSH 去统一一下".
 * The model picker's field (which is not an <input>, so its computed style could
 * not be read) is visibly BORDERLESS with a faint fill; this one had a 1px
 * border. So: a transparent border (keeps the geometry identical), the same
 * faint fill, and — because a borderless field needs some focus affordance — a
 * thin ring while focused, applied from `searchFocus` below since inline styles
 * cannot express `:focus`.
 *
 * Height: it used to be 36px (padding 6+6 + line-height 22 + border 1+1). 用户
 * tuned it by eye: "改成30看看，就是行高减个六" → "再加回3吧" → "32吧", so 32px,
 * as an explicit border-box height with the text centred.
 *
 * Worth remembering: the first two numbers never actually rendered — the panel
 * is a column flex container with a max-height, so the field was being shrunk to
 * 21px regardless of what the style said. Only after pinning `flex: none` did
 * the declared height take effect at all.
 */
const searchStyle = {
  boxSizing: 'border-box',
  width: 'calc(100% - 16px)',
  height: '32px',
  // The panel is a column flex container with a max-height, so any child that
  // can shrink will: the field measured 21px instead of the declared height
  // until this was pinned. The list below is the thing that should scroll.
  flex: 'none',
  margin: '8px',
  padding: '0 10px',
  border: '1px solid transparent',
  borderRadius: '8px',
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  fontFamily: FONT_FAMILY,
  fontSize: '14px',
  lineHeight: '20px',
  outline: 'none',
}

/** Focus state for the borderless search field. */
const searchFocusStyle = {
  background: 'var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16)))',
  boxShadow: '0 0 0 1px var(--dsw-alias-border-l2, rgba(128,128,128,0.35))',
}

const listStyle = {
  overflowY: 'auto',
  flex: 'auto',
  padding: '0 6px 8px',
}

const itemStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '2px',
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  cursor: 'pointer',
  textAlign: 'left',
  // Explicit: a bare <button> keeps the browser's own 13.3333px / Arial.
  fontFamily: FONT_FAMILY,
  fontSize: '14px',
  lineHeight: '22px',
  fontWeight: 400,
}

const nameStyle = {
  fontFamily: FONT_FAMILY,
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '22px',
}

const descStyle = {
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  fontFamily: FONT_FAMILY,
  fontSize: '12px',
  lineHeight: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

const statusStyle = {
  padding: '12px',
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  fontFamily: FONT_FAMILY,
  fontSize: '13px',
}

/** Result line under the list, with an optional undo for uninstall. */
const noticeStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: '0 8px 8px',
  padding: '6px 10px',
  borderRadius: '8px',
  fontSize: '12px',
  lineHeight: '18px',
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))',
  color: 'var(--dsw-alias-label-secondary, #b6bfcc)',
}

/**
 * The right-click / long-press actions menu, positioned against the viewport.
 *
 * Colours are DSH theme variables, and the background is deliberately the SAME
 * one the panel above it already uses (`--dsw-specific-tip`):
 *
 *   panel + menu  --dsw-specific-tip            (opaque in both themes)
 *   text          --dsw-alias-label-primary     (flips with the theme)
 *   hover         --dsw-alias-interactive-bg-hover
 *
 * Two wrong turns here, both caught by 用户:
 *
 *  1. `--dsw-alias-bg-elevated` does not exist in DSH at all, so a hardcoded
 *     dark fallback always won while the text kept following the theme —
 *     dark-on-dark, a measured contrast ratio of 1.25 on the light theme.
 *  2. `--dsw-specific-menu` does exist, but on the desktop's dark theme it is
 *     `#43454a73`: alpha 0.45, meant to sit behind DSH's own backdrop blur.
 *     With no blur the conversation showed straight through the menu.
 *
 * `--dsw-specific-tip` is opaque in both themes and is exactly what the panel
 * beside it uses, so the two match. `backdropFilter` stays as a safety net in
 * case a kernel ever ships a translucent value there.
 */
const menuStyle = {
  position: 'fixed',
  zIndex: 2147483000,
  minWidth: '196px',
  padding: '4px',
  borderRadius: '10px',
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
  background: 'var(--dsw-specific-tip, #23262e)',
  backdropFilter: 'blur(8px)',
  boxShadow: '0 8px 28px rgba(0,0,0,0.36)',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  fontFamily: FONT_FAMILY,
  fontSize: '14px',
  lineHeight: '24px',
  userSelect: 'none',
}

/** The skill name at the top of the menu (the thing being acted on). */
const menuHeaderStyle = {
  padding: '6px 10px 4px',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.28))',
  marginBottom: '4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** One menu row. */
const menuItemStyle = {
  padding: '6px 10px',
  borderRadius: '6px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/**
 * Hover feedback for a menu row. Inline styles cannot express `:hover`, and the
 * panel's own rows already use this same mutate-on-hover approach.
 */
const menuItemHandlers = {
  onMouseEnter: (event) => {
    event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.16))'
  },
  onMouseLeave: (event) => {
    event.currentTarget.style.background = 'transparent'
  },
}

/** The picker's bolt glyph: DeepSeek palette gradient + slim stroke. */
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="dsh-sp-bolt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--dsw-static-deepseek-400, rgb(103, 158, 254))" />
          <stop offset="100%" stopColor="var(--dsw-static-deepseek-600, rgb(72, 104, 178))" />
        </linearGradient>
      </defs>
      <path
        d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"
        fill="url(#dsh-sp-bolt-grad)"
        stroke="var(--dsw-static-deepseek-600, rgb(72, 104, 178))"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The picker control for the composer's right tool row. Rendered by the slot
 * renderer with the composed props: owner InputZone (`session`, `input`) plus
 * the framework session kit (`useInput`, `inputActions`).
 */
function SkillPickerButton(props) {
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState(undefined)
  const [error, setError] = useState(undefined)
  const [source, setSource] = useState(undefined)
  // Skills whose entry file is renamed to `SKILL.md.disabled`. The official
  // `skills/list` RPC cannot report them (the provider does not see them at
  // all), so they come from the host scan — without this a disabled skill would
  // simply disappear and there would be no way to switch it back on.
  const [disabledSkills, setDisabledSkills] = useState([])
  /** Name of the skill an action is currently running on. */
  const [busySkill, setBusySkill] = useState('')
  /** Result line under the list: { kind, text, undo? }. */
  const [notice, setNotice] = useState(undefined)
  /**
   * The notice is a toast, not a fixture — it dismisses itself.
   *
   * 用户 caught it sitting on screen indefinitely after a trivial "located it in
   * the file manager" action. Anything carrying an undo gets a much longer
   * window, because dismissing it also removes the only way back.
   */
  useEffect(() => {
    if (notice === undefined) return undefined
    const timer = window.setTimeout(() => setNotice(undefined), notice.undo === undefined ? 2600 : 10000)
    return () => window.clearTimeout(timer)
  }, [notice])
  /**
   * The right-click menu: { x, y, skill, disabled }.
   *
   * Actions live here instead of on the row so the list stays a list — one
   * glyph per row (the pin, which doubles as the pinned/not state) and
   * everything else behind the familiar right-click. Long-press opens the same
   * menu, because a phone has no right button.
   */
  const [menu, setMenu] = useState(undefined)
  /**
   * Which list the panel is showing: 'all' or the closed-skills view ('off').
   *
   * The closed skills used to be a permanent section under the list; 用户 asked
   * for them behind a small entry at the bottom-right instead, because a
   * section that is almost never used should not hold vertical space forever.
   */
  const [view, setView] = useState('all')
  /** The search field is borderless now, so focus needs its own affordance. */
  const [searchFocus, setSearchFocus] = useState(false)
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState(() => loadUsage())
  const [pinned, setPinned] = useState(() => loadPinned())
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const itemRefs = useRef([])
  /** Pending long-press timer for the touch path (see the menu below). */
  const longPressRef = useRef(0)
  /**
   * Distance from the window bottom to the panel's bottom edge, measured from
   * the ⚡ button each time the panel opens. See `popoverStyle`: the horizontal
   * anchor is the window's right edge, only the height follows the button.
   */
  const [panelBottom, setPanelBottom] = useState(88)

  // The usage store is shared with the official `/` menu: picks made there go
  // through window.__dshSkillPickerTrack (localStorage only). Refresh this
  // panel's state from storage whenever that event fires, so a slash pick
  // shows up as "recently used" here too — not just in the slash list.
  useEffect(() => {
    const onUsageUpdated = () => setUsage(loadUsage())
    window.addEventListener('dsh-skill-picker:usage-updated', onUsageUpdated)
    return () => window.removeEventListener('dsh-skill-picker:usage-updated', onUsageUpdated)
  }, [])

  // Pinned list and usage history live in one shared file on the host, so the
  // desktop app, the web UI and a phone all show the same ordering. The mirror
  // in localStorage is what the synchronous ranking reads; pull once on mount
  // and again whenever a slash pick or another client changes the shared copy.
  useEffect(() => {
    const onSharedState = () => {
      setUsage(loadUsage())
      setPinned(loadPinned())
    }
    window.addEventListener(SHARED_STATE_EVENT, onSharedState)
    void syncSharedState()
    return () => window.removeEventListener(SHARED_STATE_EVENT, onSharedState)
  }, [])

  // Prime the official `/` catalogue for this Session as soon as it is known.
  //
  // The slash menu highlights the FIRST group that settles and scrolls it into
  // view; the highlight then sticks. The picker keeps the skill group first
  // (`order: -1`), so if the command group wins that race the menu opens
  // scrolled down to 添加/指令 instead of sitting on the first skill. Nothing
  // warms the catalogue on a normal boot (`input-trigger` only calls
  // `source.warm?.()` from `sourceAdded`, i.e. for a source registered after a
  // session controller already exists), so the first `/` of every session is
  // cold. Warming here costs one background request and removes that first loss.
  const activeSessionId = sessionIdOf(props)
  useEffect(() => {
    if (activeSessionId !== undefined) warmSlashSkill(activeSessionId)
  }, [activeSessionId])

  // Latest draft mirror: `useInput` is a selector hook and may only be called
  // during render, while the pick handler runs from a click callback. Sync the
  // store's current draft into a ref here (render time), so the click handler
  // appends onto the REAL current draft instead of a stale snapshot. The
  // owner-provided `input` snapshot is a secondary fallback only.
  const draftRef = useRef('')
  if (typeof props.useInput === 'function') {
    try {
      const state = props.useInput((s) => s)
      if (state !== undefined && typeof state.draft === 'string') draftRef.current = state.draft
    } catch {
      /* keep the last known draft */
    }
  } else if (props.input !== undefined && typeof props.input.draft === 'string') {
    draftRef.current = props.input.draft
  }

  const load = useCallback(async (force = false) => {
    if (!force && (skills !== undefined || error !== undefined)) return
    // Session identity comes from the slot's standard props; older kernels
    // carried it as `props.session` (see ./session-view.js).
    const sessionId = sessionIdOf(props)
    try {
      // Primary path: the official host skills API (same source as DSH's own
      // `/` completion — session-scoped, covers user + project level).
      if (typeof props.listSkills === 'function' && sessionId !== undefined) {
        const listed = await props.listSkills(sessionId)
        setSkills(Array.isArray(listed) ? listed : [])
        setSource('official')
        return
      }
    } catch (cause) {
      console.warn('[dsh-skill-picker] official skills API failed, falling back to host route:', cause)
    }
    // Fallback path: the host's own scan route (official provider roots).
    try {
      const cwd = typeof props.cwd === 'string' && props.cwd !== '' ? `?cwd=${encodeURIComponent(props.cwd)}` : ''
      const res = await fetch(`/dsh-skill-picker/skills${cwd}`, { headers: { accept: 'application/json' } })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'bad response')
      const listed = Array.isArray(json.skills) ? json.skills : []
      // The scan deliberately reports switched-off skills too (that is how the
      // closed view can list them), but they must never enter THIS list.
      setSkills(listed.filter((skill) => isUserFacingSkill(skill) && skill.disabled !== true))
      setSource('host')
    } catch (cause) {
      setError(String(cause?.message ?? cause))
    }
  }, [skills, error, props.listSkills, props.sessionId, props.session, props.cwd])

  /**
   * Load the disabled skills from the host's own scan.
   *
   * They are invisible to the official `skills/list` RPC, so this is the only
   * way the panel can offer to switch one back on. Best-effort: without it the
   * panel still works, it just cannot re-enable.
   */
  const loadDisabled = useCallback(async () => {
    try {
      const cwd = typeof props.cwd === 'string' && props.cwd !== '' ? `?cwd=${encodeURIComponent(props.cwd)}` : ''
      const res = await fetch(`/dsh-skill-picker/skills${cwd}`, { headers: { accept: 'application/json' } })
      const json = await res.json()
      if (!json.ok) return
      setDisabledSkills((Array.isArray(json.skills) ? json.skills : []).filter((skill) => skill.disabled === true))
    } catch {
      /* the disabled list is a convenience; the panel works without it */
    }
  }, [props.cwd])

  /**
   * Run one management action and report it under the list.
   *
   * Reloads both lists afterwards: a disabled skill moves out of 「全部」 into
   * 「已关闭」, and an uninstall takes it out of both.
   */
  const runSkillOp = async (action, skill, extra = {}) => {
    const name = typeof skill?.name === 'string' ? skill.name : String(skill ?? '')
    setBusySkill(name)
    setNotice(undefined)
    const result = await skillOp(action, { name, cwd: props.cwd, ...extra })
    setBusySkill('')
    if (result.ok !== true) {
      setNotice({ kind: 'err', text: result.error ?? '操作失败' })
      return
    }
    if (action === 'uninstall') {
      const id = String(result.backupPath ?? '').split(/[\\/]/).filter(Boolean).pop()
      setNotice({ kind: 'ok', text: `已卸载 /${name} —— 只是移进备份目录，没删`, undo: id })
    } else if (action === 'disable') {
      setNotice({ kind: 'ok', text: `已关闭 /${name} —— agent 也不会再加载它了` })
    } else if (action === 'enable') {
      setNotice({ kind: 'ok', text: `已开启 /${name}` })
    } else if (action === 'reveal') {
      setNotice({ kind: 'ok', text: `已在文件管理器里定位 /${name}` })
    }
    await Promise.all([load(true), loadDisabled()])
  }

  const undoUninstall = async (id) => {
    if (typeof id !== 'string' || id === '') return
    setBusySkill('(undo)')
    const result = await skillOp('restore', { id, cwd: props.cwd })
    setBusySkill('')
    if (result.ok !== true) {
      setNotice({ kind: 'err', text: result.error ?? '撤回失败' })
      return
    }
    setNotice({ kind: 'ok', text: '已撤回，技能回到原位置' })
    await Promise.all([load(true), loadDisabled()])
  }

  /**
   * Open the context menu at a viewport point, kept fully on screen.
   * `event` may be a mouse or a touch event; both carry clientX/clientY.
   */
  const openMenu = (event, skill, disabled) => {
    const width = 208
    const height = disabled ? 84 : 168
    const x = Math.max(8, Math.min(event.clientX, (window.innerWidth || 1024) - width - 8))
    const y = Math.max(8, Math.min(event.clientY, (window.innerHeight || 768) - height - 8))
    setMenu({ x, y, skill, disabled })
  }

  // Close the menu on any outside interaction — the same contract as a native
  // context menu, so it never lingers over the composer.
  //
  // BUBBLE phase on purpose, and the menu stops the event itself: a capturing
  // listener would run before the clicked item's own handler and close the menu
  // out from under the click, so every action would silently do nothing.
  useEffect(() => {
    if (menu === undefined) return undefined
    const close = () => setMenu(undefined)
    const onKey = (event) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  /**
   * The panel used to show "本地扫描" / "/ 增强：运行时接管" as badges under the
   * list. They are diagnostics for whoever is debugging, not something a user
   * needs on screen — they occupied two rows and said nothing useful day to day
   * (用户's call, and he was right).
   *
   * They are not simply dropped: "the plugin is fine" and "the plugin is not
   * running at all" look identical without them, which is the whole lesson
   * behind issue #14. So they moved here (one console line per panel open) and
   * into the ⚡ button's tooltip.
   */
  useEffect(() => {
    if (skills === undefined) return
    console.info(
      `[dsh-skill-picker] 技能列表 ${skills.length} 条，来源：${source === 'host' ? '本地扫描（官方 skills API 不可用）' : '官方 API'}`
      + `；/ 增强：${slashEnhancementMode() === 'runtime' ? '运行时接管，已生效' : '未生效（见 issue #14）'}`,
    )
  }, [skills, source])

  const toggle = () => {
    if (!open) {
      // Measure before opening so the panel is already in place on its first
      // paint (no visible jump).
      const el = boxRef.current
      if (el !== null) {
        const rect = el.getBoundingClientRect()
        setPanelBottom(Math.max(64, Math.round(window.innerHeight - rect.top + 8)))
      }
      // Pull first: a pin or a pick made on another client (desktop ↔ web ↔
      // phone) should be visible the moment this panel opens. The pull fires
      // SHARED_STATE_EVENT, which is what refreshes `usage`/`pinned` here.
      void syncSharedState()
      setUsage(loadUsage())
      // A fresh open starts clean: a toast from last time is stale by then, and
      // the panel should not reopen inside the closed-skills view.
      setNotice(undefined)
      setView('all')
      void load()
      void loadDisabled()
    }
    setOpen(!open)
  }

  const pick = (name) => {
    // Draft source: the render-time mirror of the live input store (see the
    // `draftRef` sync above). Appending onto anything else risks overwriting
    // the user's typed draft with a stale snapshot.
    const draft = draftRef.current
    const separator = draft === '' || draft.endsWith(' ') || draft.endsWith('\n') ? '' : ' '
    const next = `${draft}${separator}/${name} `
    try {
      if (typeof props.inputActions?.setDraft === 'function') {
        props.inputActions.setDraft(next)
      } else {
        console.error('[dsh-skill-picker] inputActions.setDraft unavailable; draft not written:', next)
      }
    } catch (cause) {
      console.error('[dsh-skill-picker] setDraft failed:', cause)
    }

    // Record usage for ordering (recent first, then frequent).
    const nextUsage = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } }
    setUsage(nextUsage)
    saveUsage(nextUsage)

    setOpen(false)
    setQuery('')

    // Put the caret back in the composer (see `focusComposer`). In a rAF so the
    // panel has unmounted and React has flushed the draft write first.
    const from = boxRef.current
    window.requestAnimationFrame(() => {
      focusComposer(from)
      // Second, guarded seat: a rich editor may re-apply its own selection
      // right after being focused, which would drop the caret back to the
      // start. Re-assert the end caret shortly after — but only if the composer
      // still holds focus, so a fast click elsewhere is never overridden.
      window.setTimeout(() => focusComposer(from, true), 60)
    })
  }

  const togglePin = (name) => {
    const next = pinned.includes(name) ? pinned.filter((n) => n !== name) : [...pinned, name]
    setPinned(next)
    savePinned(next)
  }

  // Close on outside pointer-down (the shell's menu convention).
  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Grouped ordering: pinned first (manual), then usage-ranked (recent then
  // frequent then untouched by name). Shared rule with the `/` completion.
  /**
   * The main list, with switched-off skills removed BY NAME.
   *
   * The official RPC should not report a disabled skill at all (the official
   * provider keys on the entry file name), and the host scan reports them on
   * purpose so the closed view can work — but this is the one place the main
   * list is actually built, so the invariant is enforced here no matter which
   * source produced the data.
   *
   * 用户 caught the leak: a skill he had closed was still listed under 全部.
   */
  const disabledNames = new Set(disabledSkills.map((skill) => skill.name))
  const groups = groupByPinned(
    (skills ?? []).filter((skill) => !disabledNames.has(skill.name)),
    usage,
    pinned,
  )
  const flat = groups.flatMap((group) => group.items)

  const filtered = (() => {
    const q = query.trim().toLowerCase()
    if (q === '') return flat.slice(0, 60)
    return flat
      .map((skill, index) => ({ skill, index, score: matchRank(skill, q) }))
      .filter((x) => x.score < 4)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .slice(0, 60)
      .map((x) => x.skill)
  })()

  // Group titles show only while browsing (no query); searching collapses the
  // list into one flat, pinned-first result set.
  const showTitles = query.trim() === '' && groups.length > 1
  const filteredNames = new Set(filtered.map((skill) => skill.name))

  /**
   * The closed-skills view, filtered by the same search box. The official RPC
   * never reports these, so without this view a disabled skill would be
   * unreachable — that is still true, it just lives one click away now.
   */
  const offFiltered = (() => {
    const q = query.trim().toLowerCase()
    if (q === '') return disabledSkills
    return disabledSkills.filter((skill) => matchRank(skill, q) < 4)
  })()

  // Keyboard navigation (#1): reset highlight when the query changes, keep it
  // in range when the result list shrinks, and keep the highlighted row visible.
  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    setActive((cur) => Math.min(cur, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered.length])

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const skill = filtered[active]
      if (skill !== undefined) pick(skill.name)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    // The marker is how dsh-pocket's mobile "file open guard" learns to leave
    // this panel alone: its rows are <button>s whose text starts with "/技能名",
    // which its looksLikeFilePath() reads as a Windows path, so it swallowed the
    // click and popped "手机上无法直接打开电脑上的文件" (see the pocket patch of
    // 2026-10-02). Guarded there, marked here.
    <div ref={boxRef} data-dsh-skill-picker="1" style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        type="button"
        onClick={toggle}
        title={`选择技能（插入 /技能名 到发送框）${source === 'host' ? '　·　列表来自本地扫描' : ''}${slashEnhancementMode() === 'runtime' ? '　·　/ 增强：运行时接管' : ''}`}
        aria-label="选择技能"
        style={{
          ...buttonStyle,
          ...(open ? { color: 'var(--dsw-alias-label-primary-bluish, #4cc9f0)' } : {}),
        }}
      >
        <BoltIcon />
      </button>
      {open && (
        <div style={{ ...popoverStyle, bottom: `${panelBottom}px` }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            placeholder="搜索技能…（↑↓ 选择，Enter 插入）"
            style={{ ...searchStyle, ...(searchFocus ? searchFocusStyle : {}) }}
            autoFocus
          />
          {error !== undefined ? (
            <div style={statusStyle}>{`加载失败：${error}`}</div>
          ) : skills === undefined ? (
            <div style={statusStyle}>加载中…</div>
          ) : (
            <>
              <div style={listStyle}>
                {view === 'off' ? (
                  offFiltered.length === 0 ? (
                    <div style={statusStyle}>
                      {query.trim() === '' ? '没有被关闭的技能' : '没有匹配的已关闭技能'}
                    </div>
                  ) : (
                    offFiltered.map((skill) => (
                      <div
                        key={`off-${skill.name}`}
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          openMenu(event, skill, true)
                        }}
                        onTouchStart={(event) => {
                          const touch = event.touches?.[0]
                          if (touch === undefined) return
                          longPressRef.current = window.setTimeout(
                            () => openMenu({ clientX: touch.clientX, clientY: touch.clientY }, skill, true),
                            500,
                          )
                        }}
                        onTouchEnd={() => window.clearTimeout(longPressRef.current)}
                        onTouchMove={() => window.clearTimeout(longPressRef.current)}
                        style={{ ...itemStyle, flexDirection: 'column', alignItems: 'flex-start', opacity: 0.6 }}
                      >
                        <span style={nameStyle}>{`/${skill.name}`}</span>
                        <span style={descStyle}>{skill.description ?? ''}</span>
                      </div>
                    ))
                  )
                ) : filtered.length === 0 ? (
                  <div style={statusStyle}>没有匹配的技能</div>
                ) : (() => {
                  let itemIndex = 0
                  const renderItem = (skill, index) => (
                    <button
                      key={skill.name}
                      type="button"
                      ref={(el) => {
                        itemRefs.current[index] = el
                      }}
                      onClick={() => pick(skill.name)}
                      onContextMenu={(event) => {
                        // Right-click opens the actions menu; see the menu block
                        // at the end of the panel. One glyph per row keeps the
                        // list scannable.
                        event.preventDefault()
                        event.stopPropagation()
                        openMenu(event, skill, false)
                      }}
                      onTouchStart={(event) => {
                        // A phone has no right button: long-press opens the same
                        // menu. Cancelled by any movement, so scrolling a long
                        // list never pops it up by accident.
                        const touch = event.touches?.[0]
                        if (touch === undefined) return
                        longPressRef.current = window.setTimeout(
                          () => openMenu({ clientX: touch.clientX, clientY: touch.clientY }, skill, false),
                          500,
                        )
                      }}
                      onTouchEnd={() => window.clearTimeout(longPressRef.current)}
                      onTouchMove={() => window.clearTimeout(longPressRef.current)}
                      onMouseEnter={(event) => {
                        setActive(index)
                        event.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))'
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = 'transparent'
                      }}
                      style={{
                        ...itemStyle,
                        flexDirection: 'row',
                        alignItems: 'center',
                        ...(index === active
                          ? { background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))' }
                          : {}),
                      }}
                    >
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: '1', minWidth: '0' }}>
                        <span style={nameStyle}>{`/${skill.name}`}</span>
                        <span style={descStyle}>{skill.description ?? ''}</span>
                      </span>
                      {/* No pin glyph on the row any more: 置顶/取消置顶 lives in
                          the right-click menu, and the 置顶 group already shows
                          which skills are pinned. 用户: "那个置顶的按钮也不需要了
                          吧，毕竟右键它就能有置顶". */}
                    </button>
                  )
                  if (!showTitles) {
                    return filtered.map((skill) => renderItem(skill, itemIndex++))
                  }
                  return groups.map((group) => {
                    const items = group.items.filter((skill) => filteredNames.has(skill.name))
                    if (items.length === 0) return null
                    return (
                      <Fragment key={group.title}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px 2px',
                            color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
                            // Measured against DSH's own sidebar heading
                            // (「工作区」): it is 14px / weight 400 / normal
                            // letter-spacing. Mine had been 11px / 600 / 0.04em,
                            // which is exactly what made it look foreign.
                            fontSize: '14px',
                            fontWeight: 400,
                            letterSpacing: 'normal',
                            lineHeight: '24px',
                          }}
                        >
                          <span>{group.title}</span>
                          <span style={{ opacity: 0.7 }}>{items.length}</span>
                        </div>
                        {items.map((skill) => renderItem(skill, itemIndex++))}
                      </Fragment>
                    )
                  })
                })()}
              </div>
              {/* Result of the last management action, with an undo for uninstall. */}
              {notice !== undefined && (
                <div style={noticeStyle}>
                  <span style={{ flex: '1', color: notice.kind === 'err' ? 'var(--dsw-alias-label-error, #ff7b72)' : undefined }}>
                    {notice.text}
                  </span>
                  {typeof notice.undo === 'string' && notice.undo !== '' && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={() => void undoUninstall(notice.undo)}
                      style={{ cursor: 'pointer', textDecoration: 'underline', flex: 'none' }}
                    >
                      撤回
                    </span>
                  )}
                </div>
              )}
              {/* The footer: a short hint on the left, the 「已关闭」 entry on the
                  right. It used to be a full section listing every disabled
                  skill — too much room for something reached rarely (用户's
                  call), so it is a small chip that opens its own view.
                  The hint itself: first written long ("右键技能 = 置顶 / 关闭 /
                  定位 / 卸载（手机长按）"), which did not line up with the rows
                  and got clipped to "手机…" — then shortened to this and kept
                  permanently, because at this length it is quiet and fits
                  (用户: "我感觉你变成这一行就不错，那你就可以永久留着了").
                  Its left margin matches the row text (list padding 6 + row
                  padding 10) so it lines up with everything above it. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  margin: '0 12px 8px 16px',
                  fontSize: '12px',
                  lineHeight: '18px',
                  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
                }}
              >
                <span style={{ minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {view === 'off' ? '右键可开启 · 手机长按' : '右键可管理 · 手机长按'}
                </span>
                <span
                  role="button"
                  tabIndex={-1}
                  title={view === 'off' ? '回到全部技能' : '查看被关闭的技能'}
                  onClick={() => {
                    setView(view === 'off' ? 'all' : 'off')
                    setQuery('')
                  }}
                  style={{
                    flex: 'none',
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {view === 'off' ? '← 全部技能' : `已关闭 ${disabledSkills.length}`}
                </span>
              </div>
              {/* The actions menu. Rendered here (not inside the row) so it can
                  be positioned against the viewport and never clipped by the
                  list's own scrolling. */}
              {menu !== undefined && (
                <div
                  style={{ ...menuStyle, left: `${menu.x}px`, top: `${menu.y}px` }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div style={menuHeaderStyle}>{`/${menu.skill.name}`}</div>
                  {!menu.disabled && (
                    <div
                      style={menuItemStyle}
                      role="button"
                      tabIndex={-1}
                      {...menuItemHandlers}
                      onClick={() => {
                        setMenu(undefined)
                        togglePin(menu.skill.name)
                      }}
                    >
                      {pinned.includes(menu.skill.name) ? '取消置顶' : '置顶到顶部'}
                    </div>
                  )}
                  <div
                    style={menuItemStyle}
                    role="button"
                    tabIndex={-1}
                    {...menuItemHandlers}
                    onClick={() => {
                      const target = menu.skill
                      const turningOff = !menu.disabled
                      setMenu(undefined)
                      void runSkillOp(turningOff ? 'disable' : 'enable', target)
                    }}
                  >
                    {menu.disabled ? '开启' : '关闭（agent 也不再加载）'}
                  </div>
                  <div
                    style={menuItemStyle}
                    role="button"
                    tabIndex={-1}
                    {...menuItemHandlers}
                    onClick={() => {
                      const target = menu.skill
                      setMenu(undefined)
                      void runSkillOp('reveal', target)
                    }}
                  >
                    在文件管理器中定位
                  </div>
                  {!menu.disabled && (
                    <div
                      style={{ ...menuItemStyle, color: 'var(--dsw-alias-label-error, #e5534b)' }}
                      role="button"
                      tabIndex={-1}
                      {...menuItemHandlers}
                      onClick={() => {
                        const target = menu.skill
                        setMenu(undefined)
                        if (!window.confirm(`卸载 /${target.name}？\n\n它会被移进备份目录（不是删除），面板里可以撤回。`)) return
                        void runSkillOp('uninstall', target)
                      }}
                    >
                      卸载（移入备份，可撤回）
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Apply the browser half: register the picker into the composer tool row. */
export function apply(ctx) {
  // Pull the shared pinned/usage state as early as possible: the `/` menu ranks
  // during render from the localStorage mirror, so the mirror has to be filled
  // before the user can type a slash. Best-effort — on failure the picker keeps
  // working from whatever this browser already had.
  void syncSharedState()

  // Primary skill source: the official host skills API. In DSH 0.1.2-alpha.x
  // the RPC moved from `connection.api.skills` (rc.x) to `remote.skills`
  // (used by the official ui-skill plugin); try both before falling back.
  const listSkills = async (sessionId) => {
    const remoteSkills = ctx.remote?.skills
    const connectionSkills = ctx.connection?.api?.skills
    const skills = remoteSkills ?? connectionSkills
    if (skills === undefined || typeof skills.list !== 'function') {
      throw new Error('skills RPC unavailable (remote.skills / connection.api.skills)')
    }
    const controller = new AbortController()
    const { result } = await skills.list({ sessionId }, controller.signal)
    if (!result.ok) throw new Error(`skill.list failed: ${result.error?.code}: ${result.error?.message}`)
    const raw = result.value?.skills ?? []
    // The host already filters user-invocable skills out of this payload; keep
    // the guard here too so the panel can never offer a skill the official `/`
    // menu hides, whatever shape a future kernel ships on the wire (issue #10).
    return raw.filter(isUserFacingSkill).map((skill) => ({ name: skill.name, description: skill.description ?? '' }))
  }

  // Legacy workspace-cwd source: the Session list snapshot still carried a
  // `current` cursor up to the 0.1.5 client line, and on those kernels the slot
  // props may not hand us a `useSessions` seat at all. Keeping this as a
  // fallback means issue #11's fix does not silently regress the older kernels
  // the compatibility table still declares.
  let legacyCwd = ''
  const syncLegacyCwd = () => {
    try {
      const snapshot = ctx.sessions.list.getSnapshot()
      const sessionId = snapshot.current
      const cwd = sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd
      legacyCwd = typeof cwd === 'string' ? cwd : ''
    } catch {
      legacyCwd = ''
    }
  }
  syncLegacyCwd()
  const unsubscribeLegacyCwd = ctx.sessions.list.subscribe(syncLegacyCwd)

  ctx.effect(() => {
    // Wrap the component so framework props pass through untouched and the
    // live workspace cwd + official skills fetcher are attached — never
    // swallow the composed props.
    //
    // The cwd is read from the slot's own standard props (see
    // ./session-view.js): the Session list snapshot has no "current" cursor
    // since the 0.1.7 client, so resolving the active Session through
    // `ctx.sessions.list` yielded `''` and the host fallback scan never
    // received the workspace. The legacy source above is consulted only when
    // the standard props resolve to nothing, so both kernel lines work.
    const PickerWithCwd = (props) => {
      const cwd = useWorkspaceCwd(props)
      return React.createElement(SkillPickerButton, {
        ...props,
        cwd: cwd === '' ? legacyCwd : cwd,
        listSkills,
      })
    }
    const dispose = ctx.slots.inject('conversation.input.right', () =>
      ctx.slots.register(
        { name: 'conversation.input.right', id: 'skill-picker', order: 100, label: 'Skill picker' },
        PickerWithCwd,
      ),
    )
    return () => {
      dispose()
      unsubscribeLegacyCwd()
    }
  }, 'dsh-skill-picker: composer input slot')

  // Fuzzy `/` completion.
  //
  // Primary mechanism (v0.5.14, issue #14): take the official source over at
  // runtime through the public `inputTriggers` service — matching, group order
  // AND pick tracking. Nothing on disk is touched, so a packaged desktop build
  // (`app.asar`), a pnpm-hardlinked install and a profile copy reached through
  // a stale symlink all work the same way. See ./slash-source.js.
  //
  // Legacy mechanism (still installed): a global matcher that the *file*-patched
  // official ui-skill calls. Kept because it is the only path on a kernel whose
  // input-trigger service does not expose the registry; harmless when the
  // runtime takeover is doing the work, because the takeover always asks the
  // official candidates for the whole catalogue (empty query) and re-ranks
  // afterwards.
  const trackPick = (name) => {
    const usage = loadUsage()
    const nextUsage = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } }
    saveUsage(nextUsage)
    // Notify the bolt panel (and any other listeners) to re-read storage so a
    // slash pick ranks as "recently used" there too, not only in the official
    // `/` menu.
    try {
      window.dispatchEvent(new CustomEvent('dsh-skill-picker:usage-updated'))
    } catch {
      /* best-effort */
    }
  }

  ctx.effect(() => {
    // Mirror the ⚡ panel's ordering: pinned first, then recently/frequently
    // used skills, then the untouched rest — so both stay in sync.
    const fuzzyMatch = (skills, query = '') => {
      // Same visibility rule as the ⚡ panel: never let the `/` list surface a
      // skill the user may not invoke (issue #10).
      const visible = (Array.isArray(skills) ? skills : []).filter(isUserFacingSkill)
      return rankPickerItems(visible, query)
    }
    window.__dshSkillPickerFuzzy = fuzzyMatch
    // Usage tracking for picks made from the official `/` menu: the patched
    // ui-skill onPick calls this so a slash pick ranks like a bolt-panel pick.
    window.__dshSkillPickerTrack = trackPick
    return () => {
      if (window.__dshSkillPickerFuzzy === fuzzyMatch) delete window.__dshSkillPickerFuzzy
      if (window.__dshSkillPickerTrack === trackPick) delete window.__dshSkillPickerTrack
    }
  }, 'dsh-skill-picker: fuzzy matcher for official / source')

  // Take the official `/` source over at runtime (issue #14): the same three
  // upgrades the file patch applies, without writing to disk.
  ctx.effect(() => {
    const inputTriggers = ctx.inputTriggers ?? ctx.get?.('inputTriggers')
    if (inputTriggers === undefined) return () => {}
    return installSlashFuzzy(inputTriggers, {
      // Rank the official display items ({name, description}) by the same rule
      // the bolt panel uses, so the two lists agree on order as well as match.
      rank: (items, query) => rankPickerItems(items, query),
      // `order: 2` (official) → `-1`: the skill group sorts above commands.
      order: -1,
      onPick: trackPick,
    })
  }, 'dsh-skill-picker: runtime takeover of the official / skill source')
}
