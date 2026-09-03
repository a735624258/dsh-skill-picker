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

import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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

/** Parse a SKILL.md frontmatter block into a key/value map (flat YAML subset). */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const out = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const value = kv[2].trim().replace(/^["']|["']$/g, '')
    if (value !== '') out[kv[1]] = value
  }
  return out
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
    if (!entry.isDirectory()) continue
    const skillDir = path.join(dir, entry.name)
    let content
    try {
      content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const meta = parseFrontmatter(content)
    // Later writes win, so project-level skills override same-named user skills.
    map.set(meta.name ?? entry.name, {
      name: meta.name ?? entry.name,
      description: meta.description ?? '',
      path: skillDir,
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
 */
async function scanSkills(cwd) {
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
 * Mount the skills route and the prompt section.
 * @param ctx - context carrying webServer and systemPrompt.
 */
export function apply(ctx) {
  ctx.effect(() => {
    const handler = async (req, res) => {
      try {
        // cwd query carries the active session's workspace root from the client.
        const cwd = req.url !== undefined ? new URL(req.url, 'http://dsh').searchParams.get('cwd') ?? undefined : undefined
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
}
