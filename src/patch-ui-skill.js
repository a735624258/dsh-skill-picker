/**
 * dsh-skill-picker — host-side self-healing patch for the official
 * `@deepseek-ai/dsh-client-ui-skill` package.
 *
 * The picker upgrades the official `/` completion in two ways that the
 * official package does not provide out of the box:
 *
 *  1. `order: 2 → -1`  — the skill group sorts ABOVE the command group
 *     (commands register with the default order 0; lower = higher in the
 *     official menu).
 *  2. fuzzy+pinyin candidates — the official prefix-only matcher
 *     (`skill.name.startsWith(query)`) is replaced by the picker's
 *     `window.__dshSkillPickerFuzzy` matcher when the picker is mounted
 *     (single source group, same list, upgraded matching).
 *
 * Every DSH boot this module scans every profile under `$DSH_HOME/profiles`
 * (default `~/.dsh/profiles`) for an installed ui-skill `lib/client.js` — the
 * shared core root (`profiles/node_modules/@deepseek-ai/…`, used by global
 * installs), the user's local patched copy (`local/dsh-client-ui-skill`), or
 * the plain npm install (`node_modules/@deepseek-ai/dsh-client-ui-skill`) — and
 * re-applies both patches when DSH upgrades overwrote them. The original file
 * is backed up once as `<file>.dsh-skill-picker.bak` before the first write.
 * All operations are idempotent and never throw: a missing profile, package
 * or read failure is reported and skipped so a broken patch can never take
 * the host down.
 *
 * @module dsh-skill-picker/patch-ui-skill
 */

import { readFile, writeFile, copyFile, readdir, access, realpath, rename } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { isDirectoryEntry } from './dir-entry.js'

/** Marker that the candidates patch is already in place. */
const FUZZY_MARKER = '__dshSkillPickerFuzzy'

/** Marker that the pick-tracking patch is already in place. */
const TRACK_MARKER = '__dshSkillPickerTrack'

/** The self-healing patches, in application order. */
export const PATCHES = [
  {
    id: 'order',
    title: 'skill group order 2 → -1 (above commands)',
    isApplied(text) {
      return /name: "skill",[\s\S]*?order:\s*-1,/.test(text)
    },
    apply(text) {
      return text.replace(/(name: "skill",\s*order: )2,/, '$1-1,')
    },
  },
  {
    id: 'fuzzy-candidates',
    title: 'prefix/rank matcher → fuzzy+pinyin matcher',
    isApplied(text) {
      return text.includes(FUZZY_MARKER)
    },
    apply(text) {
      // 官方实现随版本变过两次，两个形态都要认（2026-09-11 实测）：
      //   0.1.2-alpha.x : return skills.filter((skill) => skill.name.startsWith(query)).map(...)
      //   0.1.5-rc.x    : return (0, _xxx.rankByName)(skills, query).map(...)   ← 改成 async candidates
      // 每组捕获：$1 = 缩进，$2 = 官方那一段表达式（原样保留做 fallback）。
      const ANCHORS = [
        /(\t*)return (\(0, [\w.$]+\.rankByName\)\(skills, query\)|rankByName\(skills, query\))\.map\(\(skill\) => \(\{/,
        /(\t*)return (skills\.filter\(\(skill\) => skill\.name\.startsWith\(query\)\))\.map\(\(skill\) => \(\{/,
      ]
      for (const re of ANCHORS) {
        const m = text.match(re)
        if (!m) continue
        const [, indent, official] = m
        return text.replace(
          re,
          `${indent}// dsh-skill-picker patch: fuzzy+pinyin matcher (self-healed)\n` +
            `${indent}const officialMatcher = ${official};\n` +
            `${indent}const matcher = typeof window.${FUZZY_MARKER} === "function" ? window.${FUZZY_MARKER}(skills, query) : officialMatcher;\n` +
            `${indent}return matcher.map((skill) => ({`,
        )
      }
      return text
    },
  },
  {
    id: 'pick-tracking',
    title: 'record usage when picked from the official / menu',
    isApplied(text) {
      return text.includes(TRACK_MARKER)
    },
    apply(text) {
      return text.replace(
        /(\t*)onPick\(\{ candidate \}\) \{\n(\t*)return \{ text: `\/\$\{candidate\.name\} ` \};\n(\t*)\}/,
        (match, i1, i2, i3) =>
          `${i1}onPick({ candidate }) {\n` +
          `${i2}  // dsh-skill-picker patch: usage tracking (self-healed)\n` +
          `${i2}  try { window.${TRACK_MARKER}?.(candidate.name) } catch { /* best-effort */ }\n` +
          `${i2}  return { text: \`/\${candidate.name} \` };\n` +
          `${i3}}`,
      )
    },
  },
]

/** Resolve the DSH home directory, mirroring the official convention. */
export function dshHome() {
  return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
}

/** Subpath of the official skill UI inside any installation tree. */
const UI_SKILL_SUBPATH = ['node_modules', '@deepseek-ai', 'dsh-client-ui-skill', 'lib', 'client.js']

/** Whether a path exists (any type). Never throws. */
async function pathExists(candidate) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

/**
 * Where the *running desktop build* keeps its own copy of the official skill UI.
 *
 * A packaged DSH Desktop ships that UI in one of two shapes (issue #9):
 *
 *   - `resources/app/node_modules/…` — an **unpacked** build. The app is the
 *     installation-scoped owner, so this file is what gets served, and it is an
 *     ordinary writable file.
 *   - `resources/app.asar/dsh/node_modules/…` — a **packed** build. Electron's
 *     `fs` shim can *read* through the archive but cannot write into it, so this
 *     path is evidence for diagnosis only and is never a patch target.
 *
 * `process.resourcesPath` only exists inside Electron; a plain `dsh` CLI or web
 * run returns empty lists and nothing changes for it.
 * @returns {{writable: string[], packed: string[]}} candidate paths.
 */
export function desktopUiSkillPaths() {
  const resources = process.resourcesPath
  if (typeof resources !== 'string' || resources === '') return { writable: [], packed: [] }
  return {
    writable: [path.join(resources, 'app', ...UI_SKILL_SUBPATH)],
    packed: [path.join(resources, 'app.asar', 'dsh', ...UI_SKILL_SUBPATH)],
  }
}

/**
 * Whether a profile manifest redirects the official skill UI to its own copy.
 *
 * This is the switch that decides which copy a desktop build serves: without a
 * declared dependency the profile resolves the package from the installation
 * (`resources/app` or `app.asar`), and every profile-local copy is dead weight.
 * @param profileDir - absolute profile directory.
 * @returns true when the manifest declares `@deepseek-ai/dsh-client-ui-skill`.
 */
async function profileRedirectsUiSkill(profileDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(profileDir, 'package.json'), 'utf8'))
    const declared = { ...manifest?.dependencies, ...manifest?.devDependencies }
    return typeof declared['@deepseek-ai/dsh-client-ui-skill'] === 'string'
  } catch {
    return false
  }
}

/**
 * Explain why the patch targets found (or not found) may not be what the host
 * actually serves, for a packed desktop build (issue #9).
 *
 * Silence here was the worst part of #9: patching a stale profile copy looks
 * exactly like success, so the `/` menu kept its official matcher with no
 * signal at all.
 * @returns a sentence to append to a warning, or '' when there is nothing to say.
 */
async function packedDesktopNote() {
  const { packed } = desktopUiSkillPaths()
  if (packed.length === 0 || !(await pathExists(packed[0]))) return ''
  const profilesDir = path.join(dshHome(), 'profiles')
  let redirected = false
  try {
    for (const entry of await readdir(profilesDir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      if (await profileRedirectsUiSkill(path.join(profilesDir, entry.name))) {
        redirected = true
        break
      }
    }
  } catch {
    /* unreadable profile list: report the pessimistic case */
  }
  if (redirected) return ''
  return ' This desktop build keeps the official skill UI inside `app.asar`, which cannot be written in place,'
    + ' and no profile redirects the package to a local copy — so the served `/` menu keeps the official matcher.'
    + ' Install a profile-local override (`"@deepseek-ai/dsh-client-ui-skill": "link:…"`) or run DSH from the CLI.'
}

/**
 * Enumerate every installed ui-skill `lib/client.js` across all profiles.
 *
 * Four layouts are covered (deduplicated by real path):
 *   1. the **shared core root** `profiles/node_modules/@deepseek-ai/…` — used by
 *      a global `npm i -g @deepseek-ai/dsh`, where the official package is NOT
 *      below any single profile (issue #7 — missing this made the whole patch
 *      silently no-op for those installs);
 *   2. the user's local patched copy (`profiles/<p>/local/dsh-client-ui-skill`)
 *      — that is what a linked profile actually loads;
 *   3. the plain npm install inside a profile
 *      (`profiles/<p>/node_modules/@deepseek-ai/…`);
 *   4. the **running desktop build's own unpacked tree**
 *      (`resources/app/node_modules/@deepseek-ai/…`) — issue #9: a desktop
 *      install owns the package at installation scope, so its copy is the one
 *      served whenever no profile redirects the name.
 *
 * As a defensive extra, each profile is also asked through Node's own resolver
 * (`createRequire().resolve()`), so a layout we did not enumerate still works.
 * Never throws — a missing profiles dir yields [].
 * @returns {Promise<string[]>} candidate file paths.
 */
export async function uiSkillClientPaths() {
  const profilesDir = path.join(dshHome(), 'profiles')
  let profiles
  try {
    profiles = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    // A desktop build can still be patchable through its own resource tree
    // even when $DSH_HOME/profiles is absent or unreadable.
    profiles = []
  }
  const seen = new Set()
  const found = []

  /** Add one candidate if it exists; deduplicate by real path. */
  const collect = async (candidate) => {
    try {
      await access(candidate)
      const real = await realpath(candidate)
      if (seen.has(real)) return
      seen.add(real)
      found.push(candidate)
    } catch {
      /* not present at this location */
    }
  }

  /** Ask Node's resolver where this profile would load the package from. */
  const collectByResolve = async (profileDir) => {
    try {
      const require = createRequire(path.join(profileDir, 'package.json'))
      await collect(require.resolve('@deepseek-ai/dsh-client-ui-skill/lib/client.js'))
    } catch {
      /* not resolvable from this profile */
    }
  }

  // 1. shared core root (global installs) — see the doc comment above.
  await collect(path.join(profilesDir, 'node_modules', '@deepseek-ai', 'dsh-client-ui-skill', 'lib', 'client.js'))

  // 4. the running desktop build's own unpacked tree (issue #9): this is the
  //    copy a packaged Electron app serves when no profile redirects the name.
  for (const candidate of desktopUiSkillPaths().writable) await collect(candidate)

  for (const entry of profiles) {
    // `node_modules` is a sibling of the profiles, not a profile itself.
    if (entry.name === 'node_modules') continue
    // A profile directory may itself be reached through a link; follow it
    // instead of relying on the lstat-based dirent (see dir-entry.js).
    if (!(await isDirectoryEntry(profilesDir, entry))) continue
    // 2. the user's local patched copy (what a linked profile actually loads).
    await collect(path.join(profilesDir, entry.name, 'local', 'dsh-client-ui-skill', 'lib', 'client.js'))
    // 3. the plain npm install inside the profile.
    await collect(path.join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh-client-ui-skill', 'lib', 'client.js'))
    // Defensive: whatever Node itself would resolve (dupes removed above).
    await collectByResolve(path.join(profilesDir, entry.name))
  }
  return found
}

/**
 * Apply both patches to one ui-skill client.js. Idempotent: already-applied
 * patches are reported as skipped; the original file is backed up once before
 * the first modification. Never throws for a patch that does not match (it is
 * reported as `noop`), only for actual I/O failures.
 * @param {string} file - absolute path to the target client.js.
 * @returns {Promise<{file: string, patched: string[], skipped: string[], noop: string[]}>}
 */
export async function patchUiSkillFile(file) {
  const text = await readFile(file, 'utf8')
  const result = { file, patched: [], skipped: [], noop: [] }
  let next = text
  for (const patch of PATCHES) {
    if (patch.isApplied(next)) {
      result.skipped.push(patch.id)
      continue
    }
    const candidate = patch.apply(next)
    if (candidate === next) {
      result.noop.push(patch.id)
      continue
    }
    next = candidate
    result.patched.push(patch.id)
  }
  if (result.patched.length === 0) return result
  const backup = `${file}.dsh-skill-picker.bak`
  try {
    await access(backup)
  } catch {
    await copyFile(file, backup)
  }
  // Write through a temp file + rename instead of an in-place `writeFile`:
  //  - pnpm installs are HARDLINKED to a shared content-addressable store, so
  //    writing in place would mutate that shared inode and silently change
  //    every other project using the same package version. rename() swaps the
  //    directory entry instead, leaving the shared inode untouched.
  //  - rename is also atomic, so an interrupted boot cannot leave a torn file.
  const tmp = `${file}.dsh-skill-picker.tmp`
  await writeFile(tmp, next, 'utf8')
  await rename(tmp, file)
  return result
}

/**
 * Self-heal entry point: scan all profiles, patch every ui-skill copy found,
 * and return one combined report. Never throws — each failure is collected
 * into `errors` so the host boot is never taken down by a broken patch.
 * @returns {Promise<{files: Array, errors: string[]}>}
 */
export async function healUiSkillPatches() {
  const files = await uiSkillClientPaths()
  const filesReport = []
  const errors = []
  for (const file of files) {
    try {
      filesReport.push(await patchUiSkillFile(file))
    } catch (error) {
      errors.push(`${file}: ${String(error?.message ?? error)}`)
    }
  }
  // Loud on the empty case. Silence here was the most confusing part of
  // issue #7: "found 0 targets" and "everything already applied" used to print
  // identically, so nobody could tell the patch had never run at all.
  const note = await packedDesktopNote()
  if (files.length === 0) {
    console.warn('[dsh-skill-picker] ui-skill patch: 0 target client.js found under '
      + `${path.join(dshHome(), 'profiles')} — fuzzy+pinyin matching will NOT be applied.`
      + `${note} See https://github.com/a735624258/dsh-skill-picker/issues/14`)
  } else if (note !== '') {
    // Targets existed, so the old code stayed silent — but none of them is the
    // copy the host serves. That is issue #9's silent failure: a "successful"
    // patch run that changes nothing the user can see.
    console.warn(`[dsh-skill-picker] ui-skill patch: patched ${files.length} profile copy/copies,`
      + ` but none of them is the one this host serves.${note}`)
  }
  return { files: filesReport, errors }
}
