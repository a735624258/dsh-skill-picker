/**
 * Regression tests for the desktop installation tree (issue #9).
 *
 * A packaged DSH Desktop owns `@deepseek-ai/dsh-client-ui-skill` itself, so the
 * copy it serves is the one in its resource tree — not any profile-local copy.
 * Two shapes exist:
 *
 *   - unpacked `resources/app/node_modules/…` → an ordinary writable file that
 *     MUST be discovered, or the patch silently no-ops (the old behaviour);
 *   - packed `resources/app.asar/…` → unreadable-in-place-for-writing, so the
 *     only correct outcome is a loud, specific warning instead of silence.
 *
 * `process.resourcesPath` is an Electron-only property; these tests set it on
 * the plain Node runtime to exercise the same code path.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  desktopUiSkillPaths,
  healUiSkillPatches,
  uiSkillClientPaths,
} from '../src/patch-ui-skill.js'

const PKG = ['node_modules', '@deepseek-ai', 'dsh-client-ui-skill']

/** Run `fn` with a temporary DSH home and resource root; restore both after. */
async function withFixture(fn, { resources = false } = {}) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'skill-picker-desktop-'))
  const dshHome = path.join(home, 'dsh')
  const previousHome = process.env.DSH_HOME
  const previousResources = process.resourcesPath
  process.env.DSH_HOME = dshHome
  await mkdir(path.join(dshHome, 'profiles'), { recursive: true })
  if (resources) process.resourcesPath = path.join(home, 'resources')
  try {
    return await fn({ home, dshHome, resources: path.join(home, 'resources') })
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousResources === undefined) delete process.resourcesPath
    else process.resourcesPath = previousResources
    await rm(home, { recursive: true, force: true })
  }
}

/**
 * A minimal stand-in for the official `lib/client.js`, carrying the three
 * anchors the patch layer looks for (order / rankByName candidates / onPick).
 * The mid-line shapes are copied from the real 0.1.5 and 0.2.0 builds.
 */
const OFFICIAL_BODY = [
  '// official client.js',
  'const source = {',
  '\t\t\t\tname: "skill",',
  '\t\t\t\torder: 2,',
  '\t\t\t\tasync candidates(session, { query, signal }) {',
  '\t\t\t\t\tif (signal.aborted) return [];',
  '\t\t\t\t\treturn (0, _primitives.rankByName)(skills, query).map((skill) => ({',
  '\t\t\t\t\t\tname: skill.name,',
  '\t\t\t\t\t}));',
  '\t\t\t\t},',
  '\t\t\t\tonPick({ candidate }) {',
  '\t\t\t\t\treturn { text: `/${candidate.name} ` };',
  '\t\t\t\t}',
  '};',
].join('\n')

/** Create a fake `lib/client.js` and return its path. */
async function writeClient(dir) {
  const lib = path.join(dir, 'lib')
  await mkdir(lib, { recursive: true })
  const file = path.join(lib, 'client.js')
  await writeFile(file, OFFICIAL_BODY, 'utf8')
  return file
}

/** Capture console.warn lines emitted while `fn` runs. */
async function captureWarnings(fn) {
  const lines = []
  const original = console.warn
  console.warn = (...args) => lines.push(args.join(' '))
  try {
    await fn()
  } finally {
    console.warn = original
  }
  return lines
}

test('desktopUiSkillPaths is inert without an Electron resource root', async () => {
  const previous = process.resourcesPath
  delete process.resourcesPath
  try {
    assert.deepEqual(desktopUiSkillPaths(), { writable: [], packed: [] })
  } finally {
    if (previous !== undefined) process.resourcesPath = previous
  }
})

test('finds the unpacked desktop installation tree (resources/app)', async () => {
  await withFixture(async ({ resources }) => {
    const expected = await writeClient(path.join(resources, 'app', ...PKG))
    const found = await uiSkillClientPaths()
    assert.deepEqual(found, [expected])
  }, { resources: true })
})

test('applies the patches to the unpacked desktop copy', async () => {
  await withFixture(async ({ resources }) => {
    const file = await writeClient(path.join(resources, 'app', ...PKG))
    const report = await healUiSkillPatches()
    assert.deepEqual(report.errors, [])
    assert.equal(report.files.length, 1)
    assert.deepEqual(report.files[0].patched, ['order', 'fuzzy-candidates', 'pick-tracking'])
  }, { resources: true })
})

test('warns that a packed app.asar copy cannot be patched from a profile', async () => {
  await withFixture(async ({ dshHome, resources }) => {
    // A stale profile-local copy exists, so the old code reported success.
    await writeClient(path.join(dshHome, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-client-ui-skill'))
    await writeClient(path.join(resources, 'app.asar', 'dsh', ...PKG))
    const warnings = await captureWarnings(() => healUiSkillPatches())
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /app\.asar/)
    assert.match(warnings[0], /no profile redirects/)
  }, { resources: true })
})

test('stays silent when a profile redirects the package to a local copy', async () => {
  await withFixture(async ({ dshHome, resources }) => {
    await writeClient(path.join(dshHome, 'profiles', 'web', 'local', 'dsh-client-ui-skill'))
    await writeFile(
      path.join(dshHome, 'profiles', 'web', 'package.json'),
      JSON.stringify({ dependencies: { '@deepseek-ai/dsh-client-ui-skill': 'link:./local/dsh-client-ui-skill' } }),
      'utf8',
    )
    await writeClient(path.join(resources, 'app.asar', 'dsh', ...PKG))
    const warnings = await captureWarnings(() => healUiSkillPatches())
    assert.deepEqual(warnings, [])
  }, { resources: true })
})

test('warns with zero targets and points at the issue tracker', async () => {
  await withFixture(async ({ dshHome }) => {
    const warnings = await captureWarnings(() => healUiSkillPatches())
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /0 target/)
    assert.match(warnings[0], /issues\/9/)
    assert.ok(dshHome.length > 0)
  })
})
