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

/** Persist the pinned list; never throws. */
function savePinned(pinned) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinned))
  } catch {
    /* storage unavailable — pinning just won't persist */
  }
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

/** Persist the usage history; never throws. */
function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage))
  } catch {
    /* storage unavailable — ordering just won't persist */
  }
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
    try {
      // Primary path: the official host skills API (same source as DSH's own
      // `/` completion — session-scoped, covers user + project level).
      if (typeof props.listSkills === 'function' && props.session?.sessionId !== undefined) {
        const listed = await props.listSkills(props.session.sessionId)
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
      setSkills(Array.isArray(json.skills) ? json.skills : [])
      setSource('host')
    } catch (cause) {
      setError(String(cause?.message ?? cause))
    }
  }, [skills, error, props.listSkills, props.session, props.cwd])

  const toggle = () => {
    if (!open) {
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

  const filtered = flat
    .filter((skill) => {
      const q = query.trim().toLowerCase()
      if (q === '') return true
      return (
        skill.name.toLowerCase().includes(q) ||
        String(skill.description ?? '').toLowerCase().includes(q) ||
        skillPinyinText(skill.name, skill.description ?? '').toLowerCase().includes(q)
      )
    })
    .slice(0, 60)

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
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Apply the browser half: register the picker into the composer tool row. */
export function apply(ctx) {
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
    return raw.map((skill) => ({ name: skill.name, description: skill.description ?? '' }))
  }

  // Track the active session's workspace cwd for the host-route fallback.
  let currentCwd = ''
  const syncCwd = () => {
    try {
      const snapshot = ctx.sessions.list.getSnapshot()
      const sessionId = snapshot.current
      const cwd = sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd
      currentCwd = typeof cwd === 'string' ? cwd : ''
    } catch {
      currentCwd = ''
    }
  }

  syncCwd()
  const unsubscribe = ctx.sessions.list.subscribe(syncCwd)
  ctx.effect(() => {
    // Wrap the component so framework props pass through untouched and the
    // live workspace cwd + official skills fetcher are attached — never
    // swallow the composed props.
    const PickerWithCwd = (props) =>
      React.createElement(SkillPickerButton, { ...props, cwd: currentCwd, listSkills })
    const dispose = ctx.slots.inject('conversation.input.right', () =>
      ctx.slots.register(
        { name: 'conversation.input.right', id: 'skill-picker', order: 100, label: 'Skill picker' },
        PickerWithCwd,
      ),
    )
    return () => {
      dispose()
      unsubscribe()
    }
  }, 'dsh-skill-picker: composer input slot')

  // Fuzzy `/` completion: instead of registering a parallel source group
  // (which would appear as a second list next to the official one), expose a
  // global matcher that the patched official ui-skill candidates calls. The
  // official group stays THE single `/` list; only its matching behaviour is
  // upgraded to fuzzy + pinyin (name AND description, subsequence scoring).
  ctx.effect(() => {
    // Mirror the ⚡ panel's ordering: pinned first, then recently/frequently
    // used skills, then the untouched rest — so both stay in sync.
    const fuzzyMatch = (skills, query = '') => {
      const ordered = groupByPinned(skills, loadUsage(), loadPinned()).flatMap((group) => group.items)
      const q = String(query).trim().toLowerCase()
      if (q === '') return ordered
      // Rank by the ⚡ panel's exact order (pinned → recent → frequent → rest)
      // so both lists stay in sync: fuzzysort only decides WHO matches, not
      // the display order. Without this, a slash query re-sorts matches by
      // match score and the two menus diverge for the same skill.
      const rankByName = new Map(ordered.map((skill, index) => [skill.name, index]))
      const targets = ordered.map((s) => ({
        s,
        search: `${s.name} ${s.description ?? ''} ${skillPinyinText(s.name, s.description ?? '')}`,
      }))
      const results = fuzzysort.go(q, targets, {
        key: 'search',
        limit: 30,
        threshold: -10000,
      })
      return results
        .filter((r) => r.score > 0)
        .map((r) => r.obj.s)
        .sort((a, b) => (rankByName.get(a.name) ?? 0) - (rankByName.get(b.name) ?? 0))
    }
    window.__dshSkillPickerFuzzy = fuzzyMatch
    // Usage tracking for picks made from the official `/` menu: the patched
    // ui-skill onPick calls this so a slash pick ranks like a bolt-panel pick.
    const trackPick = (name) => {
      const usage = loadUsage()
      const nextUsage = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } }
      saveUsage(nextUsage)
      // Notify the bolt panel (and any other listeners) to re-read storage so
      // a slash pick ranks as "recently used" there too, not only in the
      // official / menu.
      try {
        window.dispatchEvent(new CustomEvent('dsh-skill-picker:usage-updated'))
      } catch {
        /* best-effort */
      }
    }
    window.__dshSkillPickerTrack = trackPick
    return () => {
      if (window.__dshSkillPickerFuzzy === fuzzyMatch) delete window.__dshSkillPickerFuzzy
      if (window.__dshSkillPickerTrack === trackPick) delete window.__dshSkillPickerTrack
    }
  }, 'dsh-skill-picker: fuzzy matcher for official / source')
}
