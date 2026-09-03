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

import React, { useCallback, useEffect, useRef, useState } from 'react'
import fuzzysort from 'fuzzysort'
import { pinyin } from 'pinyin-pro'

/** Required services: slot registry, host connection (official skills API), sessions (workspace cwd fallback), input triggers (/ fuzzy source). */
export const inject = ['slots', 'connection', 'sessions', 'inputTriggers']

/** localStorage key for the picker's per-browser usage history. */
const USAGE_KEY = 'dsh-skill-picker:usage'

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
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const itemRefs = useRef([])

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
    if (!open) void load()
    setOpen(!open)
  }

  const pick = (name) => {
    // Draft source: owner InputZone snapshot first, framework hook second.
    let draft = ''
    try {
      if (props.input !== undefined && typeof props.input.draft === 'string') {
        draft = props.input.draft
      } else if (typeof props.useInput === 'function') {
        const state = props.useInput((s) => s)
        if (state !== undefined && typeof state.draft === 'string') draft = state.draft
      }
    } catch (cause) {
      console.error('[dsh-skill-picker] reading draft failed:', cause)
    }
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

  // Close on outside pointer-down (the shell's menu convention).
  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Usage ordering: last picked first, then most frequent, then by name
  // (shared with the `/` completion — one rule everywhere).
  const ordered = rankByUsage(skills ?? [], usage)

  const filtered = ordered
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
                ) : (
                  filtered.map((skill, index) => (
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
                        ...(index === active
                          ? { background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))' }
                          : {}),
                      }}
                    >
                      <span style={nameStyle}>{`/${skill.name}`}</span>
                      <span style={descStyle}>{skill.description ?? ''}</span>
                    </button>
                  ))
                )}
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
  // Resolve the trigger pipeline service at apply scope (not inside an effect),
  // exactly like the official ui-skill plugin does — in DSH 0.1.2-alpha.x the
  // service lives in @deepseek-ai/dsh-client-ui-input-trigger and is only
  // reachable from the plugin root context.
  const inputTriggers = (typeof ctx.get === 'function' ? ctx.get('inputTriggers') : ctx.inputTriggers)

  // Primary skill source: the official host skills API (the exact RPC ui-skill
  // feeds DSH's own `/` completion with — session-scoped, all skill layers).
  const listSkills = async (sessionId) => {
    const skills = ctx.connection?.api?.skills
    if (skills === undefined || typeof skills.list !== 'function') {
      throw new Error('connection.api.skills unavailable')
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

  // Fuzzy `/` completion source: negative order puts the skill group ABOVE
  // the slash commands (command source sits at order 0), and beats the
  // official ui-skill prefix source too — typing `/` matches name AND
  // description anywhere, with usage ordering (same rule as the ⚡ panel).
  ctx.effect(() => {
    // Skills cache per session, so both candidates and the lexicon (chip
    // decoration of `/skill-name` in the draft) have the same names.
    const namesCache = new Map() // sessionId -> string[] (skill names)
    const lexiconListeners = new Map() // sessionId -> Set<listener>
    const notifyLexicon = (sessionId) => {
      for (const fn of [...(lexiconListeners.get(sessionId) ?? [])]) {
        try { fn() } catch (err) { console.error('[dsh-skill-picker] lexicon listener failed:', err) }
      }
    }
    const refreshNames = async (sessionId) => {
      try {
        const skills = await listSkills(sessionId)
        namesCache.set(sessionId, (Array.isArray(skills) ? skills : []).map((s) => s.name))
        notifyLexicon(sessionId)
      } catch {
        /* keep last cache; lexicon stays empty until a successful fetch */
      }
    }

    const source = {
      trigger: '/',
      name: 'skill-fuzzy',
      order: -10,
      async candidates(session, { query, signal }) {
        const skills = await listSkills(session.sessionId)
        if (signal.aborted) return []
        namesCache.set(session.sessionId, skills.map((s) => s.name))
        notifyLexicon(session.sessionId)
        const ordered = rankByUsage(skills, loadUsage())
        const q = String(query ?? '').trim().toLowerCase()
        if (q === '') {
          // Empty `/` surfaces ALL skills, usage first (same rule as ⚡ panel).
          return ordered.map((s) => ({ name: s.name, description: s.description }))
        }
        // Typing uses fuzzysort (subsequence matching + relevance score) over
        // name AND description, so partial/gappy queries and keywords match.
        // The search string also carries the skill's pinyin forms (spaced,
        // joined, initials — name and description), so `ji yi` / `jiyi` / `jy`
        // match Chinese skill names & descriptions.
        const targets = ordered.map((s) => ({
          s,
          search: `${s.name} ${s.description ?? ''} ${skillPinyinText(s.name, s.description ?? '')}`,
        }))
        const results = fuzzysort.go(q, targets, {
          key: 'search',
          limit: 12,
          threshold: -10000,
        })
        return results
          .filter((r) => r.score > 0)
          .map((r) => ({ name: r.obj.s.name, description: r.obj.s.description }))
      },
      warm(session) {
        refreshNames(session.sessionId)
      },
      lexicon(session) {
        return namesCache.get(session.sessionId)
      },
      subscribeLexicon(session, listener) {
        const key = session.sessionId
        const set = lexiconListeners.get(key) ?? new Set()
        set.add(listener)
        lexiconListeners.set(key, set)
        return () => {
          const cur = lexiconListeners.get(key)
          if (cur !== undefined) {
            cur.delete(listener)
            if (cur.size === 0) lexiconListeners.delete(key)
          }
        }
      },
      onPick({ candidate }) {
        // Record usage (same rule as the ⚡ panel) so slash-picked skills
        // rank higher the next time they open `/`.
        try {
          const usage = loadUsage()
          const name = candidate.name
          const next = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } }
          saveUsage(next)
        } catch {
          /* usage recording is best-effort */
        }
        return { text: `/${candidate.name} ` }
      },
    }
    // inputTriggers is resolved at apply scope (see top of apply); fail loudly
    // instead of silently dropping the fuzzy `/` source.
    if (inputTriggers === undefined || typeof inputTriggers.registerSource !== 'function') {
      console.warn('[dsh-skill-picker] inputTriggers service unavailable; fuzzy / completion disabled (⚡ panel still works)')
      return
    }
    const unregister = inputTriggers.registerSource(source)
    return () => {
      unregister()
      namesCache.clear()
      lexiconListeners.clear()
    }
  }, 'dsh-skill-picker: fuzzy / source')
}
