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
 * (default `~/.dsh/profiles`) for an installed ui-skill `lib/client.js` —
 * either the user's local patched copy (`local/dsh-client-ui-skill`) or the
 * plain npm install (`node_modules/@deepseek-ai/dsh-client-ui-skill`) — and
 * re-applies both patches when DSH upgrades overwrote them. The original file
 * is backed up once as `<file>.dsh-skill-picker.bak` before the first write.
 * All operations are idempotent and never throw: a missing profile, package
 * or read failure is reported and skipped so a broken patch can never take
 * the host down.
 *
 * @module dsh-skill-picker/patch-ui-skill
 */

import { readFile, writeFile, copyFile, readdir, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Marker that the candidates patch is already in place. */
const FUZZY_MARKER = '__dshSkillPickerFuzzy'

/** The two self-healing patches, in application order. */
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
    title: 'prefix matcher → fuzzy+pinyin matcher',
    isApplied(text) {
      return text.includes(FUZZY_MARKER)
    },
    apply(text) {
      return text.replace(
        /(\t*)return skills\.filter\(\(skill\) => skill\.name\.startsWith\(query\)\)\.map\(\(skill\) => \(\{/,
        (match, indent) =>
          `${indent}// dsh-skill-picker patch: fuzzy+pinyin matcher (self-healed)\n` +
          `${indent}const matcher = typeof window.${FUZZY_MARKER} === "function" ? window.${FUZZY_MARKER}(skills, query) : skills.filter((skill) => skill.name.startsWith(query));\n` +
          `${indent}return matcher.map((skill) => ({`,
      )
    },
  },
]

/** Resolve the DSH home directory, mirroring the official convention. */
export function dshHome() {
  return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
}

/**
 * Enumerate every installed ui-skill `lib/client.js` across all profiles:
 * the user's local patched copy first (that is what the profile actually
 * loads when linked), then the plain npm install. Deduplicated by real path.
 * Never throws — a missing profiles dir yields [].
 * @returns {Promise<string[]>} candidate file paths.
 */
export async function uiSkillClientPaths() {
  const profilesDir = path.join(dshHome(), 'profiles')
  let profiles
  try {
    profiles = await readdir(profilesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const seen = new Set()
  const found = []
  for (const entry of profiles) {
    if (!entry.isDirectory()) continue
    const candidates = [
      path.join(profilesDir, entry.name, 'local', 'dsh-client-ui-skill', 'lib', 'client.js'),
      path.join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh-client-ui-skill', 'lib', 'client.js'),
    ]
    for (const candidate of candidates) {
      try {
        await access(candidate)
        const real = await import('node:fs/promises').then(({ realpath }) => realpath(candidate))
        if (!seen.has(real)) {
          seen.add(real)
          found.push(candidate)
        }
      } catch {
        /* not present at this location */
      }
    }
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
  await writeFile(file, next, 'utf8')
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
  return { files: filesReport, errors }
}
