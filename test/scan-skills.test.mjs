/**
 * Regression tests for the skill scan (issue #6): a skill that lives behind a
 * symlink or a Windows junction must be listed exactly like a real directory,
 * and broken links must be skipped instead of throwing or hiding the entry.
 *
 * The scan reads its roots from `DSH_AGENTS_HOME` / `DSH_HOME`, so every test
 * runs against a throwaway home and never touches the real one.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { scanSkills } from '../src/index.js'

/** Windows needs a junction (no admin/developer mode); POSIX uses a dir link. */
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir'

/** Write `<dir>/SKILL.md` with flat frontmatter. */
async function writeSkill(dir, name, description = `${name} description`) {
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody of ${name}.\n`,
    'utf8',
  )
}

/** Run `fn` with a temporary DSH home and restore the environment afterwards. */
async function withTempHome(fn) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'skill-picker-scan-'))
  const agentsHome = path.join(home, 'agents')
  const dshHome = path.join(home, 'dsh')
  const previous = {
    DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME,
    DSH_HOME: process.env.DSH_HOME,
  }
  process.env.DSH_AGENTS_HOME = agentsHome
  process.env.DSH_HOME = dshHome
  try {
    await mkdir(path.join(agentsHome, 'skills'), { recursive: true })
    await mkdir(dshHome, { recursive: true })
    return await fn({ home, agentsHome, dshHome })
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(home, { recursive: true, force: true })
  }
}

test('lists a plain directory skill', async () => {
  await withTempHome(async ({ agentsHome }) => {
    await writeSkill(path.join(agentsHome, 'skills', 'code-review'), 'code-review')
    const names = (await scanSkills()).map((skill) => skill.name)
    assert.deepEqual(names, ['code-review'])
  })
})

test('follows a symlink/junction skill directory (issue #6)', async () => {
  await withTempHome(async ({ home, agentsHome }) => {
    const real = path.join(home, 'repos', 'icraft-toolkit', 'skills', 'neat')
    await writeSkill(real, 'neat')
    await symlink(real, path.join(agentsHome, 'skills', 'neat'), LINK_TYPE)

    const skills = await scanSkills()
    assert.deepEqual(skills.map((skill) => skill.name), ['neat'])
    assert.equal(skills[0].description, 'neat description')
  })
})

test('treats link and real skills identically, alongside each other', async () => {
  await withTempHome(async ({ home, agentsHome }) => {
    await writeSkill(path.join(agentsHome, 'skills', 'eli5'), 'eli5')
    const real = path.join(home, 'elsewhere', 'find-crux')
    await writeSkill(real, 'find-crux')
    await symlink(real, path.join(agentsHome, 'skills', 'find-crux'), LINK_TYPE)
    await writeSkill(path.join(home, 'dsh', 'skills', 'backup-memory'), 'backup-memory')

    const names = (await scanSkills()).map((skill) => skill.name)
    assert.deepEqual(names, ['backup-memory', 'eli5', 'find-crux'])
  })
})

test('skips a broken link without throwing', async () => {
  await withTempHome(async ({ home, agentsHome }) => {
    await writeSkill(path.join(agentsHome, 'skills', 'plain'), 'plain')
    await symlink(path.join(home, 'gone'), path.join(agentsHome, 'skills', 'dangling'), LINK_TYPE)

    const names = (await scanSkills()).map((skill) => skill.name)
    assert.deepEqual(names, ['plain'])
  })
})

test('skips a linked directory with no SKILL.md and a link to a plain file', async (t) => {
  await withTempHome(async ({ home, agentsHome }) => {
    const empty = path.join(home, 'empty-target')
    await mkdir(empty, { recursive: true })
    await symlink(empty, path.join(agentsHome, 'skills', 'no-skill-md'), LINK_TYPE)

    const file = path.join(home, 'notes.md')
    await writeFile(file, 'not a skill\n', 'utf8')
    try {
      await symlink(file, path.join(agentsHome, 'skills', 'file-link'), 'file')
    } catch (error) {
      // Windows only grants file symlinks to admin/developer mode; the
      // directory-link cases above already cover the follow-the-link logic.
      if (error.code === 'EPERM') return t.skip('file symlinks need privileges on this machine')
      throw error
    }

    assert.deepEqual(await scanSkills(), [])
  })
})

test('project-level link skills are scanned when a cwd is given', async () => {
  await withTempHome(async ({ home, agentsHome }) => {
    await writeSkill(path.join(agentsHome, 'skills', 'user-level'), 'user-level')
    const project = path.join(home, 'workspace')
    const real = path.join(home, 'shared', 'project-skill')
    await writeSkill(real, 'project-skill')
    await mkdir(path.join(project, '.agents', 'skills'), { recursive: true })
    await symlink(real, path.join(project, '.agents', 'skills', 'project-skill'), LINK_TYPE)

    const names = (await scanSkills(project)).map((skill) => skill.name)
    assert.deepEqual(names, ['project-skill', 'user-level'])
  })
})
