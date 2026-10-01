/**
 * Skill operations for the ⚡ panel: enable / disable, reveal in the file
 * manager, and uninstall-with-undo.
 *
 * Three rules this module exists to enforce:
 *
 * 1. **Never delete anything.** "Uninstall" MOVES the skill into
 *    `$DSH_HOME/skill-backups/<stamp>-<name>/` next to a manifest, and the panel
 *    can move it back. This module makes no destructive filesystem call at all;
 *    a move that cannot be done with `rename()` (i.e. across volumes) fails
 *    loudly instead of falling back to copy-then-remove.
 *
 * 2. **Only inside the caller's skill roots.** The roots are passed in — this
 *    module must NOT re-derive them, or the two copies drift apart (which is
 *    exactly how the picker once ended up patching one file while DSH served
 *    another). Every path the browser sends is resolved and checked against the
 *    given roots; a path that escapes them, is the root itself, or is nested
 *    deeper than one level is refused. The route is reachable without
 *    authentication — plugin routes sit outside the web server's auth gate — so
 *    this is not optional.
 *
 * 3. **Reversible, and honest about state.** Disabling renames the skill's entry
 *    file, which is exactly what the official `dsh-skill-filesystem` provider
 *    keys on, so a disabled skill really does stop loading for agents too — it
 *    is not hidden only in our own UI. Re-enabling renames it back.
 *
 * Entry-file shape comes from the provider: a skill is a directory containing
 * `SKILL.md`, or a top-level `.md` file inside a skill root.
 *
 * @module dsh-skill-picker/skill-ops
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { dshHome } from './patch-ui-skill.js'

/** The entry file the official provider looks for. */
export const ENTRY = 'SKILL.md'

/** What a disabled entry file is called. The provider ignores it entirely. */
export const DISABLED_ENTRY = `${ENTRY}.disabled`

/** Set on every mutating request, so a cross-site form POST cannot reach these. */
export const CLIENT_HEADER = 'x-dsh-skill-picker'

/** Where uninstalled skills go, newest first. */
export function skillBackupDir() {
  return path.join(dshHome(), 'skill-backups')
}

/**
 * Resolve a browser-supplied skill path against the caller's roots.
 *
 * Requires exactly one path segment below a root, so a request for the root
 * itself, for a file nested inside a skill, or for `../../` is rejected.
 *
 * @param candidate - the path the browser sent.
 * @param roots - absolute skill roots (from the host's own helpers).
 * @returns the resolved absolute path, or undefined when it is not a skill slot.
 */
export function resolveSkillPath(candidate, roots) {
  if (typeof candidate !== 'string' || candidate === '') return undefined
  const list = Array.isArray(roots) ? roots : []
  const resolved = path.resolve(candidate)
  for (const root of list) {
    const base = path.resolve(root)
    const relative = path.relative(base, resolved)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) continue
    if (relative.split(path.sep).filter(Boolean).length !== 1) continue
    return resolved
  }
  return undefined
}

/** Whether the path is a directory (a skill folder) or a file (a root-level .md). */
async function pathKind(target) {
  try {
    return (await stat(target)).isDirectory() ? 'dir' : 'file'
  } catch {
    return undefined
  }
}

/** Whether anything exists at `candidate` (used to refuse overwrites). */
async function exists(candidate) {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

/**
 * Turn a skill on or off by renaming its entry file.
 *
 * @param target - an already-validated skill path.
 * @param disabled - the state to move to.
 * @returns `{ entry, disabled }` — the entry file name now in place.
 */
export async function setSkillDisabled(target, disabled) {
  const kind = await pathKind(target)
  if (kind === undefined) throw new Error(`skill not found: ${target}`)
  const dir = kind === 'dir' ? target : path.dirname(target)
  const base = kind === 'dir' ? ENTRY : path.basename(target)
  const plain = path.join(dir, base)
  const off = path.join(dir, `${base}.disabled`)
  const hasPlain = await exists(plain)
  const hasOff = await exists(off)

  if (disabled) {
    if (hasOff && !hasPlain) throw new Error('already disabled')
    if (!hasPlain) throw new Error(`cannot disable: ${base} is not there`)
    if (hasOff) throw new Error(`cannot disable: ${base} and ${base}.disabled both exist`)
    await rename(plain, off)
    return { entry: `${base}.disabled`, disabled: true }
  }

  if (hasPlain && !hasOff) throw new Error('already enabled')
  if (!hasOff) throw new Error(`cannot enable: ${base}.disabled is not there`)
  if (hasPlain) throw new Error(`cannot enable: ${base} and ${base}.disabled both exist`)
  await rename(off, plain)
  return { entry: base, disabled: false }
}

/**
 * Move a skill into the backup directory (nothing is deleted).
 *
 * Layout: `skill-backups/<stamp>-<name>/` holds `manifest.json` plus the moved
 * skill directory (or file) under its original name, so it moves straight back.
 *
 * @returns `{ backupPath, restoreTarget }`.
 */
export async function uninstallSkill(target) {
  const kind = await pathKind(target)
  if (kind === undefined) throw new Error(`skill not found: ${target}`)
  const name = path.basename(target)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(skillBackupDir(), `${stamp}-${name}`)
  await mkdir(backupPath, { recursive: true })
  await rename(target, path.join(backupPath, name))
  await writeFile(path.join(backupPath, 'manifest.json'), `${JSON.stringify({
    name,
    kind,
    originalPath: target,
    movedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')
  return { backupPath, restoreTarget: target }
}

/** List backups, newest first, so the panel can offer an undo. */
export async function listSkillBackups(roots) {
  let entries
  try {
    entries = await readdir(skillBackupDir(), { withFileTypes: true })
  } catch {
    return []
  }
  const backups = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = path.join(skillBackupDir(), entry.name)
    try {
      const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
      backups.push({
        id: entry.name,
        name: typeof manifest.name === 'string' ? manifest.name : entry.name,
        originalPath: typeof manifest.originalPath === 'string' ? manifest.originalPath : undefined,
        movedAt: typeof manifest.movedAt === 'string' ? manifest.movedAt : undefined,
        restorable: resolveSkillPath(manifest.originalPath, roots) !== undefined,
      })
    } catch {
      /* not one of ours (or a damaged manifest) — leave it alone */
    }
  }
  return backups.sort((a, b) => String(b.movedAt ?? '').localeCompare(String(a.movedAt ?? '')))
}

/**
 * Move a backup back where it came from.
 *
 * Refuses when the destination is occupied, so a restore can never overwrite a
 * skill installed after the uninstall. The emptied backup folder is kept under
 * `skill-backups/.restored/` rather than deleted.
 */
export async function restoreSkillBackup(id, roots) {
  if (typeof id !== 'string' || id === '' || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new Error('invalid backup id')
  }
  const dir = path.join(skillBackupDir(), id)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
  } catch {
    throw new Error('that backup is gone')
  }
  const original = resolveSkillPath(manifest.originalPath, roots)
  if (original === undefined) throw new Error('that backup no longer points inside a skill root')
  if (await exists(original)) {
    throw new Error(`${path.basename(original)} is occupied again — move it away first`)
  }
  await rename(path.join(dir, path.basename(original)), original)
  const done = path.join(skillBackupDir(), '.restored')
  await mkdir(done, { recursive: true })
  await rename(dir, path.join(done, id)).catch(() => {})
  return { restored: original }
}

/**
 * Reveal a skill in the OS file manager.
 *
 * Best-effort and detached: the host must not wait on (or be taken down by) a
 * file-manager window.
 */
export function revealSkill(target, revealPath) {
  const show = typeof revealPath === 'string' && revealPath !== '' ? revealPath : target
  try {
    if (process.platform === 'win32') {
      spawn('explorer.exe', [`/select,${show}`], { detached: true, stdio: 'ignore' }).unref()
      return true
    }
    if (process.platform === 'darwin') {
      spawn('open', ['-R', show], { detached: true, stdio: 'ignore' }).unref()
      return true
    }
    spawn('xdg-open', [path.dirname(show)], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
}
