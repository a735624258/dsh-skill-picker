/**
 * Regression tests for ui-skill patch target discovery (issue #7).
 *
 * The official `@deepseek-ai/dsh-client-ui-skill` package is NOT always below a
 * single profile: with a global `npm i -g @deepseek-ai/dsh` it lives at the
 * shared `profiles/node_modules/...` root. When that location was missing from
 * the candidate list, `uiSkillClientPaths()` returned `[]` and the whole
 * fuzzy+pinyin patch silently no-op'd — no error, plugin looked healthy.
 *
 * Every test runs against a throwaway DSH_HOME, so the real install is never
 * touched (`dshHome()` reads `process.env.DSH_HOME` on each call).
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { uiSkillClientPaths } from '../src/patch-ui-skill.js'

/** Windows needs a junction (no admin/developer mode); POSIX uses a dir link. */
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir'

const PKG = ['@deepseek-ai', 'dsh-client-ui-skill']

/** Create `<dir>/lib/client.js` and return its path. */
async function writeClient(dir, body = '// official client.js\n') {
  const lib = path.join(dir, 'lib')
  await mkdir(lib, { recursive: true })
  const file = path.join(lib, 'client.js')
  await writeFile(file, body, 'utf8')
  return file
}

/** Run `fn` with a temporary DSH home; restore the environment afterwards. */
async function withTempHome(fn) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'skill-picker-patch-'))
  const dshHome = path.join(home, 'dsh')
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = dshHome
  try {
    await mkdir(path.join(dshHome, 'profiles'), { recursive: true })
    return await fn({ home, dshHome })
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
}

test('finds the package at the shared profiles/node_modules root (global install)', async () => {
  await withTempHome(async ({ dshHome }) => {
    const expected = await writeClient(
      path.join(dshHome, 'profiles', 'node_modules', ...PKG),
    )
    const found = await uiSkillClientPaths()
    assert.deepEqual(found, [expected])
  })
})

test('finds a profile-local patched copy (local/dsh-client-ui-skill)', async () => {
  await withTempHome(async ({ dshHome }) => {
    const expected = await writeClient(
      path.join(dshHome, 'profiles', 'web', 'local', 'dsh-client-ui-skill'),
    )
    const found = await uiSkillClientPaths()
    assert.deepEqual(found, [expected])
  })
})

test('finds a plain npm install inside a profile', async () => {
  await withTempHome(async ({ dshHome }) => {
    const expected = await writeClient(
      path.join(dshHome, 'profiles', 'web', 'node_modules', ...PKG),
    )
    const found = await uiSkillClientPaths()
    assert.deepEqual(found, [expected])
  })
})

test('finds shared root and profile copy together, without duplicates', async () => {
  await withTempHome(async ({ dshHome }) => {
    const profiles = path.join(dshHome, 'profiles')
    const shared = await writeClient(path.join(profiles, 'node_modules', ...PKG))
    // A profile that links the SAME package: both candidates resolve to one
    // real path, so the result must stay deduplicated.
    await mkdir(path.join(profiles, 'web', 'local'), { recursive: true })
    await symlink(
      path.join(profiles, 'node_modules', ...PKG),
      path.join(profiles, 'web', 'local', 'dsh-client-ui-skill'),
      LINK_TYPE,
    )
    const found = await uiSkillClientPaths()
    assert.deepEqual(found, [shared])
  })
})

test('returns [] when nothing is installed (and stays silent-safe)', async () => {
  await withTempHome(async () => {
    assert.deepEqual(await uiSkillClientPaths(), [])
  })
})

test('returns [] when the profiles dir itself is missing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'skill-picker-nohome-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(home, 'does-not-exist')
  try {
    assert.deepEqual(await uiSkillClientPaths(), [])
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})
