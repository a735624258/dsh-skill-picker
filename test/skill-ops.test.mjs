/**
 * Skill operations: enable / disable, uninstall-to-backup, restore.
 *
 * These are the only code paths in the plugin that rename or move the user's
 * files, so each guarantee gets a test: nothing is deleted, nothing outside the
 * given roots is ever touched, and every state change can be undone.
 *
 * `DSH_HOME` is redirected to a temp directory, so the suite never touches the
 * real `~/.dsh` — this matters more here than anywhere else in the repo.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after, before, beforeEach } from 'node:test'

let home
let skillOps

before(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'dsh-skill-ops-'))
  process.env.DSH_HOME = home
  // Imported after DSH_HOME is set: `dshHome()` is read at call time, but the
  // backup path is derived from it on every call anyway — this just makes the
  // ordering obvious.
  skillOps = await import('../src/skill-ops.js')
})

after(async () => {
  delete process.env.DSH_HOME
  await rm(home, { recursive: true, force: true })
})

/** Create `<root>/<name>/SKILL.md`, returning the skill directory. */
async function makeSkill(root, name, body = '---\nname: ' + name + '\ndescription: test\n---\n') {
  const dir = path.join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'SKILL.md'), body, 'utf8')
  return dir
}

const exists = async (candidate) => {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

let root
beforeEach(async () => {
  root = await mkdtemp(path.join(home, 'skills-'))
})

test('resolveSkillPath accepts one level below a root and nothing else', () => {
  const roots = [path.join(home, 'skills'), path.join(home, 'agents-skills')]
  assert.equal(skillOps.resolveSkillPath(path.join(home, 'skills', 'ok'), roots), path.join(home, 'skills', 'ok'))
  // The root itself is not a skill.
  assert.equal(skillOps.resolveSkillPath(path.join(home, 'skills'), roots), undefined)
  // Nor is a file inside a skill.
  assert.equal(skillOps.resolveSkillPath(path.join(home, 'skills', 'ok', 'SKILL.md'), roots), undefined)
  // Nor anything that escapes.
  assert.equal(skillOps.resolveSkillPath(path.join(home, 'skills', '..', 'other'), roots), undefined)
  assert.equal(skillOps.resolveSkillPath(path.join(home, 'elsewhere'), roots), undefined)
  assert.equal(skillOps.resolveSkillPath('', roots), undefined)
  assert.equal(skillOps.resolveSkillPath(undefined, roots), undefined)
  assert.equal(skillOps.resolveSkillPath('C:\\Windows\\System32', roots), undefined)
})

test('disable renames the entry file, enable renames it back', async () => {
  const dir = await makeSkill(root, 'demo')
  const first = await skillOps.setSkillDisabled(dir, true)
  assert.equal(first.entry, 'SKILL.md.disabled')
  assert.equal(await exists(path.join(dir, 'SKILL.md')), false)
  assert.equal(await exists(path.join(dir, 'SKILL.md.disabled')), true)

  const back = await skillOps.setSkillDisabled(dir, false)
  assert.equal(back.entry, 'SKILL.md')
  assert.equal(await exists(path.join(dir, 'SKILL.md')), true)
  assert.equal(await exists(path.join(dir, 'SKILL.md.disabled')), false)
})

test('disable refuses a second time instead of clobbering', async () => {
  const dir = await makeSkill(root, 'twice')
  await skillOps.setSkillDisabled(dir, true)
  await assert.rejects(() => skillOps.setSkillDisabled(dir, true), /already disabled/)
})

test('enable refuses when nothing is disabled', async () => {
  const dir = await makeSkill(root, 'not-disabled')
  await assert.rejects(() => skillOps.setSkillDisabled(dir, false), /already enabled/)
})

test('the "is not there" messages still fire when neither file exists', async () => {
  const dir = path.join(root, 'empty-skill')
  await mkdir(dir, { recursive: true })
  await assert.rejects(() => skillOps.setSkillDisabled(dir, true), /is not there/)
  await assert.rejects(() => skillOps.setSkillDisabled(dir, false), /is not there/)
})

test('a missing skill is reported, not created', async () => {
  await assert.rejects(() => skillOps.setSkillDisabled(path.join(root, 'ghost'), true), /skill not found/)
})

test('uninstall MOVES the skill into the backup directory', async () => {
  const dir = await makeSkill(root, 'uninstall-me')
  const result = await skillOps.uninstallSkill(dir)

  assert.equal(await exists(dir), false, 'the original must be gone from the skill root')
  assert.equal(await exists(path.join(result.backupPath, 'uninstall-me', 'SKILL.md')), true, 'but kept in the backup')
  const manifest = JSON.parse(await readFile(path.join(result.backupPath, 'manifest.json'), 'utf8'))
  assert.equal(manifest.name, 'uninstall-me')
  assert.equal(manifest.originalPath, dir)
  assert.equal(result.restoreTarget, dir)
})

test('restore moves it back, and refuses when the slot is taken again', async () => {
  const dir = await makeSkill(root, 'round-trip')
  const { backupPath } = await skillOps.uninstallSkill(dir)
  const id = path.basename(backupPath)

  const listed = await skillOps.listSkillBackups([root])
  assert.equal(listed[0]?.id, id)
  assert.equal(listed[0]?.name, 'round-trip')
  assert.equal(listed[0]?.restorable, true)

  await skillOps.restoreSkillBackup(id, [root])
  assert.equal(await exists(path.join(dir, 'SKILL.md')), true, 'back on disk')

  // The same backup is now spent, and a fresh skill occupies the slot.
  await makeSkill(root, 'round-trip')
  const second = await skillOps.uninstallSkill(dir)
  await makeSkill(root, 'round-trip')
  await assert.rejects(
    () => skillOps.restoreSkillBackup(path.basename(second.backupPath), [root]),
    /occupied/,
  )
})

test('a backup whose original path is outside the roots is not restorable', async () => {
  const dir = await makeSkill(root, 'escaping')
  const { backupPath } = await skillOps.uninstallSkill(dir)
  const manifestPath = path.join(backupPath, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.originalPath = path.join(home, 'somewhere-else', 'escaping')
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')

  const id = path.basename(backupPath)
  const listed = await skillOps.listSkillBackups([root])
  assert.equal(listed.find((entry) => entry.id === id)?.restorable, false)
  await assert.rejects(() => skillOps.restoreSkillBackup(id, [root]), /outside|no longer points/)
})

test('restore rejects a path-shaped backup id', async () => {
  await assert.rejects(() => skillOps.restoreSkillBackup('../evil', [root]), /invalid backup id/)
  await assert.rejects(() => skillOps.restoreSkillBackup('', [root]), /invalid backup id/)
})

test('there is no destructive filesystem call anywhere in the module', async () => {
  // The promise this feature makes to the user. A structural test is the only
  // kind that keeps holding after someone edits the file — but it has to ignore
  // prose, since the doc comment talks about exactly this rule.
  const source = await readFile(new URL('../src/skill-ops.js', import.meta.url), 'utf8')
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  assert.equal(
    /\.(rm|rmdir|unlink|truncate)\s*\(|\b(rm|rmdir|unlink|truncate)\s*\(/.test(code),
    false,
    'a destructive fs call appeared',
  )
  const imports = /import\s*\{([^}]*)\}\s*from\s*'node:fs\/promises'/.exec(source)
  assert.ok(imports !== null, 'the fs/promises import should be explicit')
  assert.equal(/\b(rm|rmdir|unlink|truncate)\b/.test(imports[1]), false, 'imported names must stay non-destructive')
})

test('listSkillBackups tolerates a stray directory without a manifest', async () => {
  await mkdir(path.join(skillOps.skillBackupDir(), 'not-ours'), { recursive: true })
  const listed = await skillOps.listSkillBackups([root])
  assert.equal(listed.some((entry) => entry.id === 'not-ours'), false)
})

test('skillBackupDir lives under DSH_HOME', async () => {
  assert.equal(skillOps.skillBackupDir(), path.join(home, 'skill-backups'))
  // And the whole suite only ever wrote inside it.
  const entries = await readdir(home)
  assert.ok(entries.includes('skill-backups'))
})
