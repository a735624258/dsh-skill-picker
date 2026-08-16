window.__ModuleLoader__.load({ id: 'dsh-skill-picker', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots", "sessions"];
var USAGE_KEY = "dsh-skill-picker:usage";
function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function saveUsage(usage) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
  }
}
var buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  margin: "0 2px",
  padding: "0",
  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--dsw-alias-label-secondary, #c9d2e0)",
  cursor: "pointer",
  fontSize: "15px",
  lineHeight: "1",
  flex: "none"
};
var popoverStyle = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  right: "0",
  width: "340px",
  maxHeight: "320px",
  display: "flex",
  flexDirection: "column",
  background: "var(--dsw-specific-tip, #1e2533)",
  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
  borderRadius: "12px",
  boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
  overflow: "hidden",
  zIndex: 1e3
};
var searchStyle = {
  boxSizing: "border-box",
  width: "calc(100% - 16px)",
  margin: "8px",
  padding: "6px 10px",
  border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))",
  borderRadius: "8px",
  background: "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))",
  color: "var(--dsw-alias-label-primary, #e6ebf2)",
  fontSize: "13px",
  outline: "none"
};
var listStyle = {
  overflowY: "auto",
  flex: "auto",
  padding: "0 6px 8px"
};
var itemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "2px",
  width: "100%",
  padding: "7px 10px",
  border: "none",
  borderRadius: "8px",
  background: "transparent",
  color: "var(--dsw-alias-label-primary, #e6ebf2)",
  cursor: "pointer",
  textAlign: "left"
};
var nameStyle = {
  fontFamily: "var(--ds-font-family-code, ui-monospace, monospace)",
  fontSize: "13px",
  fontWeight: 500
};
var descStyle = {
  color: "var(--dsw-alias-label-tertiary, #8a94a6)",
  fontSize: "12px",
  lineHeight: "16px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%"
};
var statusStyle = {
  padding: "12px",
  color: "var(--dsw-alias-label-tertiary, #8a94a6)",
  fontSize: "13px"
};
function BoltIcon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { viewBox: "0 0 24 24", width: "20", height: "20", "aria-hidden": "true", style: { display: "block" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", { id: "dsh-sp-bolt-grad", x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "0%", stopColor: "var(--dsw-static-deepseek-400, rgb(103, 158, 254))" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", { offset: "100%", stopColor: "var(--dsw-static-deepseek-600, rgb(72, 104, 178))" })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "path",
      {
        d: "M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z",
        fill: "url(#dsh-sp-bolt-grad)",
        stroke: "var(--dsw-static-deepseek-600, rgb(72, 104, 178))",
        strokeWidth: "0.8",
        strokeLinejoin: "round"
      }
    )
  ] });
}
function SkillPickerButton(props) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [skills, setSkills] = (0, import_react.useState)(void 0);
  const [error, setError] = (0, import_react.useState)(void 0);
  const [query, setQuery] = (0, import_react.useState)("");
  const [usage, setUsage] = (0, import_react.useState)(() => loadUsage());
  const boxRef = (0, import_react.useRef)(null);
  const load = (0, import_react.useCallback)(async () => {
    if (skills !== void 0 || error !== void 0) return;
    try {
      const cwd = typeof props.cwd === "string" && props.cwd !== "" ? `?cwd=${encodeURIComponent(props.cwd)}` : "";
      const res = await fetch(`/dsh-skill-picker/skills${cwd}`, { headers: { accept: "application/json" } });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "bad response");
      setSkills(Array.isArray(json.skills) ? json.skills : []);
    } catch (cause) {
      setError(String(cause?.message ?? cause));
    }
  }, [skills, error, props.cwd]);
  const toggle = () => {
    if (!open) void load();
    setOpen(!open);
  };
  const pick = (name) => {
    let draft = "";
    try {
      if (props.input !== void 0 && typeof props.input.draft === "string") {
        draft = props.input.draft;
      } else if (typeof props.useInput === "function") {
        const state = props.useInput((s) => s);
        if (state !== void 0 && typeof state.draft === "string") draft = state.draft;
      }
    } catch (cause) {
      console.error("[dsh-skill-picker] reading draft failed:", cause);
    }
    const separator = draft === "" || draft.endsWith(" ") || draft.endsWith("\n") ? "" : " ";
    const next = `${draft}${separator}/${name} `;
    try {
      if (typeof props.inputActions?.setDraft === "function") {
        props.inputActions.setDraft(next);
      } else {
        console.error("[dsh-skill-picker] inputActions.setDraft unavailable; draft not written:", next);
      }
    } catch (cause) {
      console.error("[dsh-skill-picker] setDraft failed:", cause);
    }
    const nextUsage = { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: Date.now() } };
    setUsage(nextUsage);
    saveUsage(nextUsage);
    setOpen(false);
    setQuery("");
  };
  (0, import_react.useEffect)(() => {
    if (!open) return;
    const onDown = (event) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const ordered = (skills ?? []).slice().sort((a, b) => {
    const ua = usage[a.name];
    const ub = usage[b.name];
    const la = ua?.lastUsed ?? 0;
    const lb = ub?.lastUsed ?? 0;
    if (la !== lb) return lb - la;
    const ca = ua?.count ?? 0;
    const cb = ub?.count ?? 0;
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name);
  });
  const filtered = ordered.filter((skill) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return skill.name.toLowerCase().includes(q) || String(skill.description ?? "").toLowerCase().includes(q);
  }).slice(0, 60);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: boxRef, style: { position: "relative", display: "inline-flex", flex: "none" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        onClick: toggle,
        title: "\u9009\u62E9\u6280\u80FD\uFF08\u63D2\u5165 /\u6280\u80FD\u540D \u5230\u53D1\u9001\u6846\uFF09",
        "aria-label": "\u9009\u62E9\u6280\u80FD",
        style: {
          ...buttonStyle,
          ...open ? { color: "var(--dsw-alias-label-primary-bluish, #4cc9f0)" } : {}
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BoltIcon, {})
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: popoverStyle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: "\u641C\u7D22\u6280\u80FD\u2026",
          style: searchStyle,
          autoFocus: true
        }
      ),
      error !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: `\u52A0\u8F7D\u5931\u8D25\uFF1A${error}` }) : skills === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: "\u52A0\u8F7D\u4E2D\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: listStyle, children: filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: statusStyle, children: "\u6CA1\u6709\u5339\u914D\u7684\u6280\u80FD" }) : filtered.map((skill) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          onClick: () => pick(skill.name),
          onMouseEnter: (event) => {
            event.currentTarget.style.background = "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))";
          },
          onMouseLeave: (event) => {
            event.currentTarget.style.background = "transparent";
          },
          style: itemStyle,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: nameStyle, children: `/${skill.name}` }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: descStyle, children: skill.description ?? "" })
          ]
        },
        skill.name
      )) })
    ] })
  ] });
}
function apply(ctx) {
  let currentCwd = "";
  const syncCwd = () => {
    try {
      const snapshot = ctx.sessions.list.getSnapshot();
      const sessionId = snapshot.current;
      const cwd = sessionId === void 0 ? void 0 : snapshot.byId[sessionId]?.cwd;
      currentCwd = typeof cwd === "string" ? cwd : "";
    } catch {
      currentCwd = "";
    }
  };
  syncCwd();
  const unsubscribe = ctx.sessions.list.subscribe(syncCwd);
  ctx.effect(() => {
    const PickerWithCwd = (props) => import_react.default.createElement(SkillPickerButton, { ...props, cwd: currentCwd });
    const dispose = ctx.slots.inject(
      "conversation.input.right",
      () => ctx.slots.register(
        { name: "conversation.input.right", id: "skill-picker", order: 100, label: "Skill picker" },
        PickerWithCwd
      )
    );
    return () => {
      dispose();
      unsubscribe();
    };
  }, "dsh-skill-picker: composer input slot");
}
return module.exports; } });
//# sourceMappingURL=client.js.map
