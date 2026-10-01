// src/index.js
import { mkdir, readFile as readFile2, readdir as readdir2, rename as rename2, writeFile as writeFile2 } from "node:fs/promises";
import os2 from "node:os";
import path3 from "node:path";

// src/dir-entry.js
import { stat } from "node:fs/promises";
import path from "node:path";
async function isDirectoryEntry(dir, entry) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(path.join(dir, entry.name))).isDirectory();
  } catch {
    return false;
  }
}

// src/patch-ui-skill.js
import { readFile, writeFile, copyFile, readdir, access, realpath, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path2 from "node:path";
var FUZZY_MARKER = "__dshSkillPickerFuzzy";
var TRACK_MARKER = "__dshSkillPickerTrack";
var PATCHES = [
  {
    id: "order",
    title: "skill group order 2 \u2192 -1 (above commands)",
    isApplied(text) {
      return /name: "skill",[\s\S]*?order:\s*-1,/.test(text);
    },
    apply(text) {
      return text.replace(/(name: "skill",\s*order: )2,/, "$1-1,");
    }
  },
  {
    id: "fuzzy-candidates",
    title: "prefix/rank matcher \u2192 fuzzy+pinyin matcher",
    isApplied(text) {
      return text.includes(FUZZY_MARKER);
    },
    apply(text) {
      const ANCHORS = [
        /(\t*)return (\(0, [\w.$]+\.rankByName\)\(skills, query\)|rankByName\(skills, query\))\.map\(\(skill\) => \(\{/,
        /(\t*)return (skills\.filter\(\(skill\) => skill\.name\.startsWith\(query\)\))\.map\(\(skill\) => \(\{/
      ];
      for (const re of ANCHORS) {
        const m = text.match(re);
        if (!m) continue;
        const [, indent, official] = m;
        return text.replace(
          re,
          `${indent}// dsh-skill-picker patch: fuzzy+pinyin matcher (self-healed)
${indent}const officialMatcher = ${official};
${indent}const matcher = typeof window.${FUZZY_MARKER} === "function" ? window.${FUZZY_MARKER}(skills, query) : officialMatcher;
${indent}return matcher.map((skill) => ({`
        );
      }
      return text;
    }
  },
  {
    id: "pick-tracking",
    title: "record usage when picked from the official / menu",
    isApplied(text) {
      return text.includes(TRACK_MARKER);
    },
    apply(text) {
      return text.replace(
        /(\t*)onPick\(\{ candidate \}\) \{\n(\t*)return \{ text: `\/\$\{candidate\.name\} ` \};\n(\t*)\}/,
        (match, i1, i2, i3) => `${i1}onPick({ candidate }) {
${i2}  // dsh-skill-picker patch: usage tracking (self-healed)
${i2}  try { window.${TRACK_MARKER}?.(candidate.name) } catch { /* best-effort */ }
${i2}  return { text: \`/\${candidate.name} \` };
${i3}}`
      );
    }
  }
];
function dshHome() {
  return process.env.DSH_HOME ?? path2.join(os.homedir(), ".dsh");
}
var UI_SKILL_SUBPATH = ["node_modules", "@deepseek-ai", "dsh-client-ui-skill", "lib", "client.js"];
async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}
function desktopUiSkillPaths() {
  const resources = process.resourcesPath;
  if (typeof resources !== "string" || resources === "") return { writable: [], packed: [] };
  return {
    writable: [path2.join(resources, "app", ...UI_SKILL_SUBPATH)],
    packed: [path2.join(resources, "app.asar", "dsh", ...UI_SKILL_SUBPATH)]
  };
}
async function profileRedirectsUiSkill(profileDir) {
  try {
    const manifest = JSON.parse(await readFile(path2.join(profileDir, "package.json"), "utf8"));
    const declared = { ...manifest?.dependencies, ...manifest?.devDependencies };
    return typeof declared["@deepseek-ai/dsh-client-ui-skill"] === "string";
  } catch {
    return false;
  }
}
async function packedDesktopNote() {
  const { packed } = desktopUiSkillPaths();
  if (packed.length === 0 || !await pathExists(packed[0])) return "";
  const profilesDir = path2.join(dshHome(), "profiles");
  let redirected = false;
  try {
    for (const entry of await readdir(profilesDir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      if (await profileRedirectsUiSkill(path2.join(profilesDir, entry.name))) {
        redirected = true;
        break;
      }
    }
  } catch {
  }
  if (redirected) return "";
  return ' This desktop build keeps the official skill UI inside `app.asar`, which cannot be written in place, and no profile redirects the package to a local copy \u2014 so the served `/` menu keeps the official matcher. Install a profile-local override (`"@deepseek-ai/dsh-client-ui-skill": "link:\u2026"`) or run DSH from the CLI.';
}
async function uiSkillClientPaths() {
  const profilesDir = path2.join(dshHome(), "profiles");
  let profiles;
  try {
    profiles = await readdir(profilesDir, { withFileTypes: true });
  } catch {
    profiles = [];
  }
  const seen = /* @__PURE__ */ new Set();
  const found = [];
  const collect = async (candidate) => {
    try {
      await access(candidate);
      const real = await realpath(candidate);
      if (seen.has(real)) return;
      seen.add(real);
      found.push(candidate);
    } catch {
    }
  };
  const collectByResolve = async (profileDir) => {
    try {
      const require2 = createRequire(path2.join(profileDir, "package.json"));
      await collect(require2.resolve("@deepseek-ai/dsh-client-ui-skill/lib/client.js"));
    } catch {
    }
  };
  await collect(path2.join(profilesDir, "node_modules", "@deepseek-ai", "dsh-client-ui-skill", "lib", "client.js"));
  for (const candidate of desktopUiSkillPaths().writable) await collect(candidate);
  for (const entry of profiles) {
    if (entry.name === "node_modules") continue;
    if (!await isDirectoryEntry(profilesDir, entry)) continue;
    await collect(path2.join(profilesDir, entry.name, "local", "dsh-client-ui-skill", "lib", "client.js"));
    await collect(path2.join(profilesDir, entry.name, "node_modules", "@deepseek-ai", "dsh-client-ui-skill", "lib", "client.js"));
    await collectByResolve(path2.join(profilesDir, entry.name));
  }
  return found;
}
async function patchUiSkillFile(file) {
  const text = await readFile(file, "utf8");
  const result = { file, patched: [], skipped: [], noop: [] };
  let next = text;
  for (const patch of PATCHES) {
    if (patch.isApplied(next)) {
      result.skipped.push(patch.id);
      continue;
    }
    const candidate = patch.apply(next);
    if (candidate === next) {
      result.noop.push(patch.id);
      continue;
    }
    next = candidate;
    result.patched.push(patch.id);
  }
  if (result.patched.length === 0) return result;
  const backup = `${file}.dsh-skill-picker.bak`;
  try {
    await access(backup);
  } catch {
    await copyFile(file, backup);
  }
  const tmp = `${file}.dsh-skill-picker.tmp`;
  await writeFile(tmp, next, "utf8");
  await rename(tmp, file);
  return result;
}
async function revertUiSkillPatches() {
  const files = await uiSkillClientPaths();
  const restored = [];
  const errors = [];
  for (const file of files) {
    const backup = `${file}.dsh-skill-picker.bak`;
    try {
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      if (!PATCHES.some((patch) => patch.isApplied(text))) continue;
      let original;
      try {
        original = await readFile(backup, "utf8");
      } catch {
        continue;
      }
      const tmp = `${file}.dsh-skill-picker.tmp`;
      await writeFile(tmp, original, "utf8");
      await rename(tmp, file);
      restored.push(file);
    } catch (error) {
      errors.push(`${file}: ${String(error?.message ?? error)}`);
    }
  }
  return { restored, errors };
}
async function healUiSkillPatches() {
  const files = await uiSkillClientPaths();
  const filesReport = [];
  const errors = [];
  for (const file of files) {
    try {
      filesReport.push(await patchUiSkillFile(file));
    } catch (error) {
      errors.push(`${file}: ${String(error?.message ?? error)}`);
    }
  }
  const note = await packedDesktopNote();
  if (files.length === 0) {
    console.warn(`[dsh-skill-picker] ui-skill patch: 0 target client.js found under ${path2.join(dshHome(), "profiles")} \u2014 fuzzy+pinyin matching will NOT be applied.${note} See https://github.com/a735624258/dsh-skill-picker/issues/14`);
  } else if (note !== "") {
    console.warn(`[dsh-skill-picker] ui-skill patch: patched ${files.length} profile copy/copies, but none of them is the one this host serves.${note}`);
  }
  return { files: filesReport, errors };
}

// src/index.js
var inject = ["webServer", "systemPrompt"];
var SECTION_ORDER = 215;
var SKILL_PICKER_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-skill-picker \u63D2\u4EF6\uFF08Web GUI \u7684\u6280\u80FD\u9009\u62E9\u5668\uFF09\uFF1A\u8F93\u5165\u6846\u65C1\u6709\u6280\u80FD\u6309\u94AE\uFF0C\u7528\u6237\u70B9\u9009\u6280\u80FD\u540E\u4F1A\u628A `/\u6280\u80FD\u540D`\uFF08\u5982 /duo-xuan-pi-gai\uFF09\u63D2\u5165\u53D1\u9001\u6846\u5E76\u968F\u6D88\u606F\u53D1\u51FA\u3002DSH \u5B98\u65B9\u673A\u5236\u4F1A\u628A\u7528\u6237\u6D88\u606F\u91CC\u7684 `/\u6280\u80FD\u540D` \u624B\u52BF\u5F53\u4F5C\u6280\u80FD\u76F4\u63A5\u8C03\u7528\u5E76\u81EA\u52A8\u52A0\u8F7D\u6280\u80FD\u5185\u5BB9\u2014\u2014\u4F60\u7167\u5E38\u6309\u52A0\u8F7D\u540E\u7684\u6280\u80FD\u6307\u4EE4\u6267\u884C\u5373\u53EF\uFF0C\u65E0\u9700\u989D\u5916\u64CD\u4F5C\u3002\u7528\u6237\u8BF4\u300C\u6280\u80FD\u9009\u62E9\u5668 / \u9009\u4E2A\u6280\u80FD / \u6280\u80FD\u5217\u8868\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\u3002";
function userSkillsDir() {
  const home = process.env.DSH_HOME ?? path3.join(os2.homedir(), ".dsh");
  return path3.join(home, "skills");
}
function userAgentsSkillsDir() {
  const agentsHome = process.env.DSH_AGENTS_HOME ?? path3.join(os2.homedir(), ".agents");
  return path3.join(agentsHome, "skills");
}
function frontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match === null ? void 0 : match[1];
}
function parseFrontmatter(content) {
  const block = frontmatterBlock(content);
  if (block === void 0) return {};
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (value !== "") out[kv[1]] = value;
  }
  return out;
}
function hasFrontmatterKey(content, key) {
  const block = frontmatterBlock(content);
  if (block === void 0) return false;
  return block.split(/\r?\n/).some((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    return kv !== null && kv[1] === key;
  });
}
var LEGACY_INVOCATION_KEYS = ["disableModelInvocation", "modelInvocable", "userInvocable"];
function frontmatterBoolean(meta, key) {
  if (!Object.hasOwn(meta, key)) return void 0;
  const value = meta[key];
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    switch (value.toLowerCase()) {
      case "true":
      case "yes":
      case "on":
        return true;
      case "false":
      case "no":
      case "off":
        return false;
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}
function isUserInvocableSkill(meta, content) {
  for (const legacy of LEGACY_INVOCATION_KEYS) {
    if (hasFrontmatterKey(content, legacy)) return false;
  }
  try {
    return frontmatterBoolean(meta, "user-invocable") !== false;
  } catch {
    return false;
  }
}
async function scanSkillsDirInto(map, dir) {
  let entries;
  try {
    entries = await readdir2(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!await isDirectoryEntry(dir, entry)) continue;
    const skillDir = path3.join(dir, entry.name);
    let content;
    try {
      content = await readFile2(path3.join(skillDir, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    const meta = parseFrontmatter(content);
    if (!isUserInvocableSkill(meta, content)) continue;
    map.set(meta.name ?? entry.name, {
      name: meta.name ?? entry.name,
      description: meta.description ?? "",
      path: skillDir
    });
  }
}
async function scanSkills(cwd) {
  const map = /* @__PURE__ */ new Map();
  await scanSkillsDirInto(map, userAgentsSkillsDir());
  await scanSkillsDirInto(map, userSkillsDir());
  if (typeof cwd === "string" && cwd !== "") {
    await scanSkillsDirInto(map, path3.join(cwd, ".agents", "skills"));
    await scanSkillsDirInto(map, path3.join(cwd, ".dsh", "skills"));
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function reportUiSkillPatches(report, io = console) {
  const files = report?.files ?? [];
  const errors = report?.errors ?? [];
  const stale = files.filter((file) => file.noop.length > 0);
  if (stale.length > 0) {
    io.warn("[dsh-skill-picker] ui-skill patch: anchors not found, enhancement NOT applied (the official implementation likely changed):", JSON.stringify(stale));
  }
  const changed = files.filter((file) => file.patched.length > 0);
  const debug = process.env.DSH_SKILL_PICKER_LOG === "debug";
  if (debug) {
    io.log("[dsh-skill-picker] ui-skill patch report (debug):", JSON.stringify({ files, errors }));
  } else if (changed.length > 0) {
    io.log("[dsh-skill-picker] ui-skill patch report:", JSON.stringify({ files: changed, errors }));
  } else if (errors.length > 0) {
    io.warn("[dsh-skill-picker] ui-skill patch errors:", JSON.stringify(errors));
  }
}
function sharedStateFile() {
  return path3.join(dshHome(), "dsh-skill-picker-state.json");
}
function normalizeSharedState(value) {
  const source = value !== null && typeof value === "object" ? value : {};
  const pinned = Array.isArray(source.pinned) ? [...new Set(source.pinned.filter((name) => typeof name === "string" && name !== ""))] : [];
  const usage = {};
  const rawUsage = source.usage !== null && typeof source.usage === "object" ? source.usage : {};
  for (const [name, entry] of Object.entries(rawUsage)) {
    if (typeof name !== "string" || name === "") continue;
    const record = entry !== null && typeof entry === "object" ? entry : {};
    const count = Number.isFinite(record.count) ? Math.max(0, Math.trunc(record.count)) : 0;
    const lastUsed = Number.isFinite(record.lastUsed) ? Math.max(0, Math.trunc(record.lastUsed)) : 0;
    if (count === 0 && lastUsed === 0) continue;
    usage[name] = { count, lastUsed };
  }
  return { pinned, usage };
}
async function readSharedState() {
  try {
    return normalizeSharedState(JSON.parse(await readFile2(sharedStateFile(), "utf8")));
  } catch {
    return null;
  }
}
async function writeSharedState(state) {
  const normal = normalizeSharedState(state);
  const file = sharedStateFile();
  await mkdir(path3.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile2(tmp, `${JSON.stringify(normal, null, 2)}
`, "utf8");
  await rename2(tmp, file);
  return normal;
}
function mergeSharedState(a, b) {
  const left = normalizeSharedState(a);
  const right = normalizeSharedState(b);
  const pinned = [...left.pinned];
  for (const name of right.pinned) if (!pinned.includes(name)) pinned.push(name);
  const usage = { ...left.usage };
  for (const [name, entry] of Object.entries(right.usage)) {
    const previous = usage[name];
    usage[name] = previous === void 0 ? entry : { count: Math.max(previous.count, entry.count), lastUsed: Math.max(previous.lastUsed, entry.lastUsed) };
  }
  return normalizeSharedState({ pinned, usage });
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1e6) throw new Error("shared state body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function handleSharedState(req, res, url) {
  const json = (code, payload) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  };
  try {
    if (req.method === "PUT" || req.method === "POST") {
      const incoming = normalizeSharedState(await readJsonBody(req));
      const migrate = url.searchParams.get("migrate") === "1";
      const stored = migrate ? await readSharedState() : null;
      const next = stored === null ? await writeSharedState(incoming) : await writeSharedState(mergeSharedState(stored, incoming));
      json(200, { ok: true, state: next });
      return;
    }
    json(200, { ok: true, state: await readSharedState() });
  } catch (error) {
    json(500, { ok: false, error: String(error?.message ?? error) });
  }
}
function apply(ctx) {
  ctx.effect(() => {
    const handler = async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://dsh");
        if (url.pathname === "/dsh-skill-picker/state") {
          await handleSharedState(req, res, url);
          return;
        }
        const cwd = url.searchParams.get("cwd") ?? void 0;
        const skills = await scanSkills(cwd);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true, complete: true, skills }));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
      }
    };
    return ctx.webServer.register({ kind: "prefix", path: "/dsh-skill-picker", handler });
  }, "dsh-skill-picker: routes");
  ctx.effect(() => ctx.systemPrompt.section({
    name: "plugin:skill-picker",
    order: SECTION_ORDER,
    text: SKILL_PICKER_GUIDANCE
  }), "dsh-skill-picker: prompt section");
  ctx.effect(() => {
    const enabled = process.env.DSH_SKILL_PICKER_FILE_PATCH === "1";
    const task = enabled ? healUiSkillPatches().then((report) => reportUiSkillPatches(report)) : revertUiSkillPatches().then((report) => {
      if (report.restored.length > 0) {
        console.log(
          "[dsh-skill-picker] ui-skill patch retired; restored original file(s):",
          report.restored.join(", ")
        );
      }
      if (report.errors.length > 0) {
        console.warn("[dsh-skill-picker] ui-skill restore errors:", JSON.stringify(report.errors));
      }
    });
    task.catch((error) => {
      console.warn("[dsh-skill-picker] ui-skill patch failed:", error);
    });
    return () => {
    };
  }, "dsh-skill-picker: ui-skill self-heal patch");
}
export {
  SKILL_PICKER_GUIDANCE,
  apply,
  inject,
  reportUiSkillPatches,
  scanSkills
};
//# sourceMappingURL=index.js.map
