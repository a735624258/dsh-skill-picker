/**
 * Directory-entry helpers shared by the skill scan and the ui-skill patch scan.
 *
 * `readdir(dir, { withFileTypes: true })` describes the entry itself, not what
 * it points at: on Windows a symbolic link **and a junction** both come back as
 * `isDirectory() === false` / `isSymbolicLink() === true` (Node reports junction
 * through the same lstat semantics). A directory filter that only tests
 * `isDirectory()` therefore drops every linked skill silently — that is exactly
 * the `~/.agents/skills/neat` → repo case in issue #6.
 *
 * @module dsh-skill-picker/dir-entry
 */

import { stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * Decide whether a dirent points at a directory we may descend into.
 *
 * Real directories answer straight from the dirent (no extra syscall). Link
 * entries are resolved with `stat`, which follows the link, so junctions and
 * symlinks are treated exactly like the directories they point at. A broken
 * link (or a link into a permission wall) makes `stat` throw and is reported as
 * "not a directory" rather than taking the caller down.
 *
 * @param dir - the directory the entry was read from.
 * @param entry - the `Dirent` returned by `readdir`.
 * @returns whether the entry is, or points at, a directory.
 */
export async function isDirectoryEntry(dir, entry) {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  try {
    return (await stat(path.join(dir, entry.name))).isDirectory()
  } catch {
    return false
  }
}
