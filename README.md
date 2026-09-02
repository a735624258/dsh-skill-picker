# dsh-skill-picker

> **技能记不住名字？官方 `/` 补全靠前缀记忆，装了几十个技能谁记得住？** 本插件让技能**看得见、翻得到、选得快**——点一下 ⚡，全部技能带描述排在你面前，搜索、点选、插入，随消息发出自动加载。

DSH Web GUI 的技能选择器：在输入框（composer）工具行右侧加一个按钮，点开可以**搜索并点选已安装的技能**，选中后把官方 `/技能名` 手势插入发送框——随消息一起发出，DSH 原生机制就会自动加载该技能并执行。WorkBuddy 式"把技能写进发送框"的交互，DeepSeek Harness 复刻版。

English: A skill picker for the DSH Web GUI — a button in the composer's right tool row opens a searchable list of installed skills; picking one inserts the official `/skill-name` gesture into the draft, so DSH's native user-invocation path loads the skill with your message.

当前版本：**v0.3.0**（`/` 补全 + ⚡ 面板均支持**拼音搜索**）

## 为什么用它（vs 官方 `/` 补全）

官方内置了 `/` 技能补全，但它是**记忆驱动**的——你得先记得技能名，打 `/` + 前缀才能过滤出来。技能一多就抓瞎：

| | 官方 `/` 补全 | dsh-skill-picker |
|---|---|---|
| 触发 | 输入框打 `/` | 输入框旁 ⚡ 按钮 |
| 查找方式 | 前缀记忆驱动，**忘了名字就找不到** | 全列表浏览 + 关键字搜索，**忘了名字也能翻到** |
| 中文技能 | 只能打名字/前缀 | **拼音直搜**：`ji yi` / `jiyi` / `jy` 都能搜到「备份记忆」类中文技能（v0.3.0） |
| 排序 | 固定 | **最近使用置顶、常用靠前** |
| 描述可见 | 精简 | 完整描述一眼看全 |

**记得名字用官方，忘了名字用本插件——两者互补，可同时使用。**

## 特性

- ⚡ 一键弹出全部技能（闪电图标，人人看得懂）
- **`/` 直接补全**：输入斜杠即列出全部技能，**模糊搜索**（技能名+描述任意匹配）+ **常用排序**（v0.2.0）
- 🔤 **拼音搜索**：技能名和描述都生成拼音索引（全拼带空格 `ji yi` / 连打 `jiyi` / 首字母 `jy`），中文技能不用记字就能搜（v0.3.0）
- 🔍 实时搜索（技能名 / 描述 / 拼音都搜）
- ⌨️ **键盘导航**：弹层内 ↑↓ 选择、Enter 插入、Esc 关闭，全程不碰鼠标（v0.2.2）
- 🧠 **最近使用置顶、常用靠前**的智能排序（WorkBuddy 同款）
- 📋 走官方宿主 skills API（与 DSH 内置 `/` 补全同一数据源，自动覆盖用户级+项目级技能）
- 🧩 插入官方 `/技能名` 手势，加载/执行走 DSH 原生机制，**零 agent 侧改动**
- 🎨 跟随 Web UI 主题（CSS 变量），浅色/深色自适应
- 📦 纯 client + host 双半插件（拼音库已打包进 client bundle，无额外运行时安装）

## 安装

```sh
# 方式一：GitHub 克隆 + link（推荐，无需发布 npm）
git clone https://github.com/a735624258/dsh-skill-picker.git
dsh plugin --profile web add link:/path/to/dsh-skill-picker

# 方式二：Git 依赖直装
dsh plugin --profile web add "github:a735624258/dsh-skill-picker"

# 方式三：发布到 npm 后（预构建安装，体验最佳）
dsh plugin --profile web add dsh-skill-picker
```

> 注：已发布 npm（`npm view dsh-skill-picker` 可见 0.3.0），方式三可直接安装；未发布时请用方式一或方式二。
> 若 `dsh` 命令因 PowerShell 执行策略被拒（`File ... cannot be loaded`），用：
> `powershell -ExecutionPolicy Bypass -Command "dsh plugin --profile web add link:C:\path\to\dsh-skill-picker"`

重启 `dsh web`（或刷新页面加载新 bundle）后生效。

## 用法

1. 打开任一会话，在输入框工具行右侧找到**⚡ 按钮**
2. 点击弹出技能列表（可输入关键字或**拼音**过滤，如 `ji yi` 搜「记忆」）
3. **↑↓** 选择、**Enter** 插入（或直接鼠标点选）→ 发送框自动出现 `/技能名 `
4. 继续输入你的话并发送——DSH 会识别 `/技能名` 手势，自动加载该技能并按其指令执行

示例：点选 `duo-xuan-pi-gai` 后发送框变为 `/duo-xuan-pi-gai 帮我批改多选`，发送后技能自动加载。也可以在输入框直接打 `/duo xuan`、`/duoxuan` 靠拼音补全选到它。

## 原理

DSH 的 [dsh-tool-skill](https://github.com/deepseek-ai/deepseek-harness) 在 `agent/pre-step` 阶段扫描用户消息中的 `/kebab-case-name` 手势（`SKILL_GESTURE` 正则），命中后把对应技能内容作为 `skill-invocation` 注入对话——即"用户消息里写 `/技能名` 就会自动加载技能"是官方既有能力，只是没有 UI。

本插件只补 UI 一层：

```
[client]  ⚡ 按钮 → fetch('/dsh-skill-picker/skills')
                    ↓
[host]    扫描用户级 $DSH_HOME/skills + 项目级 <cwd>/.dsh/skills 等 → 技能目录（name + description）
                    ↓
[client]  点选 → inputActions.setDraft(draft + '/技能名 ')
                    ↓
[DSH]     agent/pre-step 识别手势 → 自动加载技能 → 执行
```

- client 半：注册到官方 `conversation.input.right` 插槽（composer 工具行、发送按钮左侧的控件位），**技能列表优先走官方宿主 skills API**（`connection.api.skills.list`——与 DSH 内置 `/` 补全同源，会话作用域，自动含用户级/项目级技能），失败时回退到 host 扫描路由；插入文本走框架输入机的 `inputActions.setDraft`（单一路径，撤销/草稿持久化自动处理）；最近/常用排序 + 拼音索引（`pinyin-pro`）在 client 侧生成，按技能缓存

## 更新日志

- **v0.3.0**：拼音搜索——`/` 补全与 ⚡ 面板的搜索目标加入技能名/描述的拼音全拼（带空格+连打）与首字母索引，中文技能可拼音直搜（如 `ji yi` →「备份记忆」）
- **v0.2.2**：⚡ 弹层键盘导航（↑↓ 选择、Enter 插入、Esc 关闭）；按钮盒 28×28 → 24×24，闪电图标 16px（对应 issue #1、#4）
- **v0.2.1**：声明兼容 DSH 0.1.2-alpha 系列
- **v0.2.0**：注册为 `/` 补全候选源（fuzzysort 模糊匹配 + 最近/常用排序，排序规则与 ⚡ 面板统一）
- **v0.1.0**：初版——⚡ 按钮弹窗搜索点选技能

## 兼容性与注意事项

- **技能来源**：**优先走官方宿主 skills API**（`connection.api.skills.list`——与 DSH 内置 `/` 补全**完全同一个数据源**，会话作用域，自动覆盖用户级 `~/.dsh/skills`、项目级 `<workspace>/.dsh/skills`、`<workspace>/.agents/skills` 等全部官方目录）；官方 API 不可用时**自动回退**到内置扫描（用户级 + 项目级目录）。两条路都支持 `DSH_HOME` 环境变量。
- **暂不扫描**：`~/.agents/skills` 与自定义技能目录（`customSkillDirs` 配置）——需要的话欢迎 PR。
- **失败保护**：client 端用 `ctx.slots.inject`（等 `conversation.input.right` 插槽声明存在才注册，插槽缺失时静默跳过，不会拖垮启动）；host 端路由 try/catch，扫描目录不存在时返回空列表而非报错。
- **依赖版本**：按 DSH `0.1.0-rc.6` API 编写（cordis 4 / web profile 标准装配）。如遇 DSH 大版本更新导致 API 变化，插件会以启动日志的插件错误提示为准，卸载 `dsh plugin --profile web remove dsh-skill-picker` 即可回退。

## 开发

```sh
# 安装依赖（提供 esbuild / fuzzysort / pinyin-pro）
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
- client：`@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-slots`、`react`、`pinyin-pro`（拼音索引，打包进 client bundle）

## License

MIT
