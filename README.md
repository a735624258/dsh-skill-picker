# dsh-skill-picker

DSH Web GUI 的技能选择器：在输入框（composer）工具行右侧加一个按钮，点开可以**搜索并点选已安装的技能**，选中后把官方 `/技能名` 手势插入发送框——随消息一起发出，DSH 原生机制就会自动加载该技能并执行。WorkBuddy 式"把技能写进发送框"的交互，DeepSeek Harness 复刻版。

English: A skill picker for the DSH Web GUI — a button in the composer's right tool row opens a searchable list of installed skills; picking one inserts the official `/skill-name` gesture into the draft, so DSH's native user-invocation path loads the skill with your message.

## 特性

- ⚡ 输入框旁常驻闪电按钮（DeepSeek 品牌蓝渐变 `--dsw-static-deepseek-400→600`），一键弹出技能面板
- 🔍 实时搜索（按技能名 / 描述）
- 📋 列表直接扫描 `~/.dsh/skills` 目录（与官方技能 provider 同源，含技能名 + 描述）
- 🧩 插入的是官方 `/技能名` 手势——加载/执行走 DSH 原生机制，**零 agent 侧改动**
- 🎨 跟随 Web UI 主题（CSS 变量），浅色/深色自适应
- 📦 纯 client + host 双半插件，无第三方运行时依赖

## 安装

```sh
# 本地路径（开发）
dsh plugin --profile web add link:/path/to/dsh-skill-picker

# 发布后（npm / GitHub link）
dsh plugin --profile web add dsh-skill-picker
```

重启 `dsh web`（或刷新页面加载新 bundle）后生效。

## 用法

1. 打开任一会话，在输入框工具行右侧找到**鲸鱼+星火按钮**
2. 点击弹出技能列表（可输入关键字过滤）
3. 点选技能 → 发送框自动出现 `/技能名 `
4. 继续输入你的话并发送——DSH 会识别 `/技能名` 手势，自动加载该技能并按其指令执行

示例：点选 `duo-xuan-pi-gai` 后发送框变为 `/duo-xuan-pi-gai 帮我批改多选`，发送后技能自动加载。

## 原理

DSH 的 [dsh-tool-skill](https://github.com/deepseek-ai/deepseek-harness) 在 `agent/pre-step` 阶段扫描用户消息中的 `/kebab-case-name` 手势（`SKILL_GESTURE` 正则），命中后把对应技能内容作为 `skill-invocation` 注入对话——即"用户消息里写 `/技能名` 就会自动加载技能"是官方既有能力，只是没有 UI。

本插件只补 UI 一层：

```
[client]  ⚡ 按钮 → fetch('/dsh-skill-picker/skills')
                    ↓
[host]    扫描 $DSH_HOME/skills（默认 ~/.dsh/skills）→ 技能目录（name + description）
                    ↓
[client]  点选 → inputActions.setDraft(draft + '/技能名 ')
                    ↓
[DSH]     agent/pre-step 识别手势 → 自动加载技能 → 执行
```

- host 半：注册 `GET /dsh-skill-picker/skills` 路由（直接扫描 DSH 用户技能目录 `$DSH_HOME/skills`，与官方 `dsh-skill-filesystem` provider 同根同源），并给 agent 注入协作指引（systemPrompt section）
- client 半：注册到官方 `conversation.input.right` 插槽（composer 工具行、发送按钮左侧的控件位），插入文本走框架输入机的 `inputActions.setDraft`（单一路径，撤销/草稿持久化自动处理）；最近/常用排序存 localStorage

## 兼容性与注意事项

- **技能目录**：扫描 `$DSH_HOME/skills`（默认 `~/.dsh/skills`）——这是 DSH 官方技能 provider（`dsh-skill-filesystem`）自己使用的标准位置，**任何标准安装的 DSH 技能都在这里**，无需额外配置。也支持通过 `DSH_HOME` 环境变量自定义 DSH 配置目录。
- **暂不扫描**：project 级技能（`<workspace>/.dsh/skills`、`<workspace>/.agents/skills`）与 `~/.agents/skills`、自定义技能目录——v1 只覆盖用户全局技能。需要的话欢迎 PR。
- **失败保护**：client 端用 `ctx.slots.inject`（等 `conversation.input.right` 插槽声明存在才注册，插槽缺失时静默跳过，不会拖垮启动）；host 端路由 try/catch，扫描目录不存在时返回空列表而非报错。
- **依赖版本**：按 DSH `0.1.0-rc.6` API 编写（cordis 4 / web profile 标准装配）。如遇 DSH 大版本更新导致 API 变化，插件会以启动日志的插件错误提示为准，卸载 `dsh plugin --profile web remove dsh-skill-picker` 即可回退。

## 开发

```sh
# 安装依赖（提供 esbuild）
npm install

# 构建（源码 src/ → 产物 lib/；client 半自动包 __ModuleLoader__ 握手）
npm run build

# 安装到 web profile（link 模式，改源码即生效）
dsh plugin --profile web add link:$PWD

# 语法自检（产物）
node --check lib/index.js
node --check lib/client.js
```

> ⚠️ 改完源码**必须 `npm run build`**：`lib/client.js` 是构建产物，ESM 源码不能直接作
> 为 client bundle 加载——DSH web shell 要求 client bundle 以
> `window.__ModuleLoader__.load({ id, factory })` 的 CJS 握手格式注册，否则启动报
> `loaded without registering "dsh-skill-picker" via __ModuleLoader__.load`。
> 构建脚本（`build.mjs`）会通过 esbuild 的 banner/footer 自动注入这段握手。

目录结构：

```
dsh-skill-picker/
├── package.json        # dsh.bundle.patch + dsh.client 声明 + build script
├── cordis.patch.yml    # bundle patch：把插件行插入 web profile
├── build.mjs           # esbuild 构建：host ESM + client CJS(__ModuleLoader__握手)
├── src/
│   ├── index.js        # host 半源码：/dsh-skill-picker/skills 路由 + prompt section
│   └── client/
│       └── index.jsx   # client 半源码：conversation.input.right 插槽组件
├── lib/                # 构建产物（勿手改，`npm run build` 生成）
│   ├── index.js
│   └── client.js
└── README.md
```

## 依赖

- host：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-host-webserver`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-system-prompt`
- client：`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`react`

## License

MIT
