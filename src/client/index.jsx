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
    { title: '📌 置顶', items: pinnedList },
    { title: '🔥 最近使用', items: recent },
    { title: '🗂️ 全部', items: rest },
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

const popoverStyle = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  right: '0',
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
}

const searchStyle = {
  boxSizing: 'border-box',
  width: 'calc(100% - 16px)',
  margin: '8px',
  padding: '6px 10px',
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))',
  borderRadius: '8px',
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  fontSize: '13px',
  outline: 'none',
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
}

const nameStyle = {
  fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
  fontSize: '13px',
  fontWeight: 500,
}

const descStyle = {
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
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
  fontSize: '13px',
}

/** Lightweight source badge shown only when the list came from the host scan fallback (official API unavailable). */
const sourceBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  margin: '0 8px 8px',
  padding: '2px 8px',
  border: '1px solid rgba(255, 193, 7, 0.35)',
  borderRadius: '999px',
  background: 'rgba(255, 193, 7, 0.1)',
  color: '#d9a520',
  fontSize: '11px',
  lineHeight: '16px',
  flex: 'none',
}

const sourceBadgeTextStyle = {
  fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
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
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState(() => loadUsage())
  const [pinned, setPinned] = useState(() => loadPinned())
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const itemRefs = useRef([])

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

  const load = useCallback(async () => {
    if (skills !== undefined || error !== undefined) return
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
      setSkills((Array.isArray(json.skills) ? json.skills : []).filter(isUserFacingSkill))
      setSource('host')
    } catch (cause) {
      setError(String(cause?.message ?? cause))
    }
  }, [skills, error, props.listSkills, props.sessionId, props.session, props.cwd])

  const toggle = () => {
    if (!open) {
      // Pull first: a pin or a pick made on another client (desktop ↔ web ↔
      // phone) should be visible the moment this panel opens. The pull fires
      // SHARED_STATE_EVENT, which is what refreshes `usage`/`pinned` here.
      void syncSharedState()
      setUsage(loadUsage())
      void load()
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
  const groups = groupByPinned(skills ?? [], usage, pinned)
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
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        type="button"
        onClick={toggle}
        title="选择技能（插入 /技能名 到发送框）"
        aria-label="选择技能"
        style={{
          ...buttonStyle,
          ...(open ? { color: 'var(--dsw-alias-label-primary-bluish, #4cc9f0)' } : {}),
        }}
      >
        <BoltIcon />
      </button>
      {open && (
        <div style={popoverStyle}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索技能…（↑↓ 选择，Enter 插入）"
            style={searchStyle}
            autoFocus
          />
          {error !== undefined ? (
            <div style={statusStyle}>{`加载失败：${error}`}</div>
          ) : skills === undefined ? (
            <div style={statusStyle}>加载中…</div>
          ) : (
            <>
              <div style={listStyle}>
                {filtered.length === 0 ? (
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
                      <span
                        role="button"
                        tabIndex={-1}
                        title={pinned.includes(skill.name) ? '取消置顶' : '置顶到列表顶部'}
                        aria-label={pinned.includes(skill.name) ? '取消置顶' : '置顶'}
                        onClick={(event) => {
                          event.stopPropagation()
                          togglePin(skill.name)
                        }}
                        style={{
                          flex: 'none',
                          marginLeft: '6px',
                          padding: '2px 4px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          lineHeight: '16px',
                          cursor: 'pointer',
                          color: pinned.includes(skill.name)
                            ? 'var(--dsw-alias-label-primary-bluish, #4cc9f0)'
                            : 'var(--dsw-alias-label-tertiary, #8a94a6)',
                          opacity: pinned.includes(skill.name) ? 1 : 0.55,
                          userSelect: 'none',
                        }}
                      >
                        {pinned.includes(skill.name) ? '📌' : '📍'}
                      </span>
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
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
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
              {source === 'host' && (
                <div style={sourceBadgeStyle} title="官方技能 API 不可用，列表来自本地目录扫描（与官方 / 补全同源）">
                  <span style={sourceBadgeTextStyle}>本地扫描</span>
                </div>
              )}
              {slashEnhancementMode() === 'runtime' && (
                <div
                  style={sourceBadgeStyle}
                  title="`/` 菜单的模糊+拼音搜索由本插件在运行时接管官方技能源（不依赖改写任何文件，issue #14）"
                >
                  <span style={sourceBadgeTextStyle}>/ 增强：运行时接管</span>
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
