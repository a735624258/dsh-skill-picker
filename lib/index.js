// src/index.js
import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
var inject = ["webServer", "systemPrompt"];
var SECTION_ORDER = 215;
var SKILL_PICKER_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-skill-picker \u63D2\u4EF6\uFF08Web GUI \u7684\u6280\u80FD\u9009\u62E9\u5668\uFF09\uFF1A\u8F93\u5165\u6846\u65C1\u6709\u6280\u80FD\u6309\u94AE\uFF0C\u7528\u6237\u70B9\u9009\u6280\u80FD\u540E\u4F1A\u628A `/\u6280\u80FD\u540D`\uFF08\u5982 /duo-xuan-pi-gai\uFF09\u63D2\u5165\u53D1\u9001\u6846\u5E76\u968F\u6D88\u606F\u53D1\u51FA\u3002DSH \u5B98\u65B9\u673A\u5236\u4F1A\u628A\u7528\u6237\u6D88\u606F\u91CC\u7684 `/\u6280\u80FD\u540D` \u624B\u52BF\u5F53\u4F5C\u6280\u80FD\u76F4\u63A5\u8C03\u7528\u5E76\u81EA\u52A8\u52A0\u8F7D\u6280\u80FD\u5185\u5BB9\u2014\u2014\u4F60\u7167\u5E38\u6309\u52A0\u8F7D\u540E\u7684\u6280\u80FD\u6307\u4EE4\u6267\u884C\u5373\u53EF\uFF0C\u65E0\u9700\u989D\u5916\u64CD\u4F5C\u3002\u7528\u6237\u8BF4\u300C\u6280\u80FD\u9009\u62E9\u5668 / \u9009\u4E2A\u6280\u80FD / \u6280\u80FD\u5217\u8868\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\u3002";
function userSkillsDir() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), ".dsh");
  return path.join(home, "skills");
}
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (value !== "") out[kv[1]] = value;
  }
  return out;
}
async function scanSkillsDirInto(map, dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(dir, entry.name);
    let content;
    try {
      content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
    } catch {
      continue;
    }
    const meta = parseFrontmatter(content);
    map.set(meta.name ?? entry.name, {
      name: meta.name ?? entry.name,
      description: meta.description ?? "",
      path: skillDir
    });
  }
}
async function scanSkills(cwd) {
  const map = /* @__PURE__ */ new Map();
  await scanSkillsDirInto(map, userSkillsDir());
  if (typeof cwd === "string" && cwd !== "") {
    await scanSkillsDirInto(map, path.join(cwd, ".dsh", "skills"));
    await scanSkillsDirInto(map, path.join(cwd, ".agents", "skills"));
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function apply(ctx) {
  ctx.effect(() => {
    const handler = async (req, res) => {
      try {
        const cwd = req.url !== void 0 ? new URL(req.url, "http://dsh").searchParams.get("cwd") ?? void 0 : void 0;
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
}
export {
  SKILL_PICKER_GUIDANCE,
  apply,
  inject
};
//# sourceMappingURL=index.js.map
