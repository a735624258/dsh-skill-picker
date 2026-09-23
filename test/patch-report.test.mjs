/**
 * Regression tests for the ui-skill patch boot logging (issue #8).
 *
 * The self-heal report lists every target file it *found*, so the old guard
 * (`report.files.length > 0`) printed a report-shaped JSON line on every boot
 * even when nothing had changed — easy to misread as a warning, and it buried
 * the lines that actually matter. These tests pin the new contract: stay silent
 * when the install is up to date, and speak up only for real changes, anchor
 * misses (`noop`) and errors.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { reportUiSkillPatches } from '../src/index.js'

/** Capture log/warn calls instead of writing to the real console. */
function capture() {
  const logs = []
  const warns = []
  return {
    io: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => warns.push(a.join(' ')) },
    logs,
    warns,
  }
}

/** One file entry shaped like `patchUiSkillFile()`'s result. */
function target(overrides = {}) {
  return { file: '/x/client.js', patched: [], skipped: [], noop: [], ...overrides }
}

/** Run `fn` with DSH_SKILL_PICKER_LOG set to `value` (unset when undefined). */
function withLogEnv(value, fn) {
  const previous = process.env.DSH_SKILL_PICKER_LOG
  if (value === undefined) delete process.env.DSH_SKILL_PICKER_LOG
  else process.env.DSH_SKILL_PICKER_LOG = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.DSH_SKILL_PICKER_LOG
    else process.env.DSH_SKILL_PICKER_LOG = previous
  }
}

test('up-to-date install stays completely silent (the issue #8 bug)', () => {
  const { io, logs, warns } = capture()
  withLogEnv(undefined, () => {
    reportUiSkillPatches(
      { files: [target({ skipped: ['order', 'fuzzy-candidates', 'pick-tracking'] })], errors: [] },
      io,
    )
  })
  assert.deepEqual(logs, [])
  assert.deepEqual(warns, [])
})

test('no target found is reported upstream, not duplicated here', () => {
  // healUiSkillPatches() warns on the empty case itself (issue #7); this
  // reporter must not add a second line for it.
  const { io, logs, warns } = capture()
  withLogEnv(undefined, () => reportUiSkillPatches({ files: [], errors: [] }, io))
  assert.deepEqual(logs, [])
  assert.deepEqual(warns, [])
})

test('a real patch prints exactly one report line, with no warning', () => {
  const { io, logs, warns } = capture()
  withLogEnv(undefined, () => {
    reportUiSkillPatches({ files: [target({ patched: ['order'] })], errors: [] }, io)
  })
  assert.equal(logs.length, 1)
  assert.match(logs[0], /ui-skill patch report/)
  assert.match(logs[0], /"patched":\["order"\]/)
  assert.deepEqual(warns, [])
})

test('an anchor miss (noop) warns instead of hiding inside the report', () => {
  const { io, logs, warns } = capture()
  withLogEnv(undefined, () => {
    reportUiSkillPatches({ files: [target({ noop: ['fuzzy-candidates'] })], errors: [] }, io)
  })
  assert.equal(warns.length, 1)
  assert.match(warns[0], /anchors not found/)
  assert.match(warns[0], /fuzzy-candidates/)
  assert.deepEqual(logs, [])
})

test('errors with nothing patched produce a warning', () => {
  const { io, logs, warns } = capture()
  withLogEnv(undefined, () => {
    reportUiSkillPatches({ files: [], errors: ['/x/client.js: EACCES'] }, io)
  })
  assert.equal(warns.length, 1)
  assert.match(warns[0], /EACCES/)
  assert.deepEqual(logs, [])
})

test('a patch plus an error carries both in a single line', () => {
  const { io, logs } = capture()
  withLogEnv(undefined, () => {
    reportUiSkillPatches({ files: [target({ patched: ['order'] })], errors: ['/y/client.js: EACCES'] }, io)
  })
  assert.equal(logs.length, 1)
  assert.match(logs[0], /"patched":\["order"\]/)
  assert.match(logs[0], /EACCES/)
})

test('DSH_SKILL_PICKER_LOG=debug prints the full report including skipped', () => {
  const { io, logs } = capture()
  withLogEnv('debug', () => {
    reportUiSkillPatches({ files: [target({ skipped: ['order'] })], errors: [] }, io)
  })
  assert.equal(logs.length, 1)
  assert.match(logs[0], /debug/)
  assert.match(logs[0], /"skipped":\["order"\]/)
})
