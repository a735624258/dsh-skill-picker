# dsh-skill-picker

[![npm version](https://img.shields.io/npm/v/dsh-skill-picker.svg)](https://www.npmjs.com/package/dsh-skill-picker)
[![license](https://img.shields.io/npm/l/dsh-skill-picker.svg)](https://github.com/a735624258/dsh-skill-picker/blob/main/LICENSE)

> **技能记不住名字？官方 `/` 补全靠前缀记忆，装了几十个技能谁记得住？** 本插件让技能**看得见、翻得到、选得快**——点一下 ⚡，全部技能带描述排在你面前，搜索、点选、插入，随消息发出自动加载。

## ⚡ 快速安装

> 🤖 **给 AI/安装助手的提示（按优先级执行，保证装到最新版）**：
>
> 1. **要最新版 / 不确定版本 → 走 GitHub 直装**。git 依赖直接拉 GitHub 最新 commit，**完全不受 npm `minimumReleaseAge` 24h 门禁影响，百分百新版**：
>    ```sh
>    dsh plugin --profile web add "git+ssh://git@github.com:a735624258/dsh-skill-picker.git"
>    ```
> 2. **要 npm 正式版** → 先查最新版本号，再**指定版本**安装（禁止裸名）：
>    ```sh
>    npm view dsh-skill-picker version   # 例如 0.5.5
>    dsh plugin --profile web add dsh-skill-picker@0.5.5
>    ```
> 3. ⚠️ **禁止执行裸名安装** `dsh plugin --profile web add dsh-skill-picker`：新版本发布后 **24 小时内**会被 pnpm `minimumReleaseAge` 门禁拦截并**自动落回旧版**——照着上面两条走就永远不会装错。

一条命令装好并注入 DSH web profile，重启 `dsh web`（或刷新页面）即生效。HTTPS clone 受限时用 SSH 形式（见下文 [安装](#安装) 的网络特例）。

DSH Web GUI 的技能选择器：在输入框（composer）工具行右侧加一个按钮，点开可以**搜索并点选已安装的技能**，选中后把官方 `/技能名` 手势插入发送框——随消息一起发出，DSH 原生机制就会自动加载该技能并执行。WorkBuddy 式"把技能写进发送框"的交互，DeepSeek Harness 复刻版。

English: A skill picker for the DSH Web GUI — a button in the composer's right tool row opens a searchable list of installed skills; picking one inserts the official `/skill-name` gesture into the draft, so DSH's native user-invocation path loads the skill with your message.

当前版本：**v0.5.10**（**修复全局安装下 `/` 补全增强静默失效**（issue #7）+ ⚡ 面板**置顶分组** + `/` 补全**自动增强补丁** + 拼音搜索 + **搜索结果按匹配相关度排序**）

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
# ⚠️ 用具体版本号安装（minimumReleaseAge 门禁会在发布后 24h 内拦截裸名，
#    自动落回旧版）——先查最新版本再指定安装：
npm view dsh-skill-picker version   # 例如 0.5.4
dsh plugin --profile web add dsh-skill-picker@0.5.4
```

> 注：已发布 npm（`npm view dsh-skill-picker` 可见 0.3.2），方式三可直接安装；未发布时请用方式一或方式二。
> 若 `dsh` 命令因 PowerShell 执行策略被拒（`File ... cannot be loaded`），用：
> `powershell -ExecutionPolicy Bypass -Command "dsh plugin --profile web add link:C:\path\to\dsh-skill-picker"`

**网络特例（国内/HTTPS 受限时）**：
- 方式一的 `git clone` 走 HTTPS 慢或不通时，改用 SSH：`git clone git@github.com:a735624258/dsh-skill-picker.git`
- 方式二的 `github:` 简写强制 HTTPS clone；仅 SSH 可用时改用：
  `dsh plugin --profile web add "git+ssh://git@github.com:a735624258/dsh-skill-picker.git"`
  （或先执行 `git config --global url."git@github.com:".insteadOf "https://github.com/"` 让 pnpm 走 SSH）
- 方式三新版本发布后 **24 小时内**裸名会被 pnpm 的 minimumReleaseAge 门禁挡到旧版（如装到 0.2.0）；急用最新请指定版本：`dsh plugin --profile web add dsh-skill-picker@0.3.1`

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

- client 半：注册到官方 `conversation.input.right` 插槽（composer 工具行、发送按钮左侧的控件位），**技能列表优先走官方宿主 skills API**（`remote.skills.list`——与 DSH 内置 `/` 补全同源，会话作用域，自动含用户级/项目级技能），失败时回退到 host 扫描路由；插入文本走框架输入机的 `inputActions.setDraft`（单一路径，撤销/草稿持久化自动处理）；最近/常用排序 + 拼音索引（`pinyin-pro`）在 client 侧生成，按技能缓存

## 与官方 `/` 补全的关系（v0.4.0 起：增强，而非并列）

**v0.2.0–0.3.4**：插件注册了一个独立的 `/` 候选源（`skill-fuzzy`），与官方 ui-skill 源**并列**——菜单里出现两个技能分组，搜索行为相互独立（冲突风险、视觉重复）。

**v0.4.0 起**：**不再注册平行源**。改为给官方 `@deepseek-ai/dsh-client-ui-skill` 包的 candidates **打补丁**——其候选逻辑从 `skill.name.startsWith(query)`（前缀匹配）换成调用插件注入的全局函数 `window.__dshSkillPickerFuzzy`（fuzzysort 模糊 + pinyin-pro 拼音 + 最近/常用排行，与 ⚡ 面板同一套规则）。**v0.5.1 起，补丁由 host 端每次启动自动应用**（另加 `order: 2→-1`：技能组排在命令组之上），首次修改前自动备份 `.bak`，DSH 升级覆盖官方包后自动重打——**安装插件即生效，无需手动操作**。

**效果**：官方「技能」分组**仍是唯一一个 `/` 技能列表**（官方规则全部保留：`userInvocable` 区分、菜单文案、排序基础），只是匹配行为被升级、分组排序被前移；插件不再产生第二列表。

> 手动兜底（旧流程，一般不需要）：把官方包拷到 `profiles/web/local/dsh-client-ui-skill/`（`lib/client.js` 改 candidates 为 `window.__dshSkillPickerFuzzy` 优先、`order` 改 `-1`），profile package.json 加依赖 `"@deepseek-ai/dsh-client-ui-skill": "link:C:/Users/<user>/.dsh/profiles/web/local/dsh-client-ui-skill"`，`pnpm install` 后重启 DSH。自动补丁对 local 副本与 npm 安装两种形态都适用，升级后自愈，无需重复手动操作。

## 更新日志

- **v0.5.11**：**修复「补丁已就位也每次启动都打印 `ui-skill patch report`」（对应 issue #8）**——`healUiSkillPatches()` 返回的 `report.files` 是**逐目标文件的报告数组**：只要扫描到 ≥1 个目标文件就有一项，与这一轮**是否真的改动过无关**；而打印守卫用的正是 `report.files.length > 0`，等于把「找到目标」当成了「发生了变更」，于是**补丁早已 up-to-date 也每次启动都打印一行** `[dsh-skill-picker] ui-skill patch report: {…}`。这行虽然只是 `console.log`，但形态上落在启动日志第一行、长得像告警，很容易被误判成插件出问题（#8 就是这么来的），还会淹没真正需要关注的 `noop` / `errors`。现在改为按「这一轮到底发生了什么」判定：① **已是最新且无错 → 完全安静**；② 仅在**确实改过文件**（`patched` 非空）时打印报告，且只报这一轮真正动过的文件 + 全部错误；③ **锚点未命中（`noop` 非空）单独 `console.warn`**——它的语义是「官方实现又换了形态、增强**没打上**」，与 issue #7 的静默失效同类，不能再被淹没；④ 新增 `DSH_SKILL_PICKER_LOG=debug` 显式开关，需要完整报告（含 `skipped`）时按需打开。新增 7 个 `npm test` 回归用例：已就位时静默、无目标不重复报、真改动打一行、`noop` 转 warn、仅错误转 warn、改动+错误合并一行、debug 开关
- **v0.5.10**：**修复全局安装下 `/` 补全增强静默失效（对应 issue #7）**——`uiSkillClientPaths()` 原先只枚举两个位置：`profiles/<profile>/local/dsh-client-ui-skill` 与 `profiles/<profile>/node_modules/@deepseek-ai/dsh-client-ui-skill`。但用**全局 `npm i -g @deepseek-ai/dsh`** 安装时，官方包位于**共享根** `profiles/node_modules/@deepseek-ai/dsh-client-ui-skill`（`readdir(profiles)` 只会给出 `node_modules` 和 `web` 两个条目，两个候选**全部落空**），于是 `found = []`、**两个补丁一次都没跑**——而且**完全无声**：`{"files":[],"errors":[]}` 与「补丁都已应用、全部 skipped」在输出上一模一样，用户和排查者都看不出补丁根本没生效，表现成「插件一切正常、技能列表能用，**就是拼音/模糊搜索是坏的**」。修复四件事：① 候选新增**共享根**（不属于任何单个 profile，放在循环外采集）；② 每个 profile 额外走一次 Node 自身解析 `createRequire().resolve()` 兜底，未枚举到的布局也能命中（按 realpath 去重，不会重复打补丁）；③ 跳过 `profiles/node_modules` 这个假 profile 条目；④ **`found.length === 0` 时 `console.warn` 大声报出**——这个静默正是 issue #7 里最坑人的地方。另修写入方式：由原地 `writeFile` 改为**临时文件 + `rename`**——pnpm 安装的包是**硬链接**到共享内容寻址 store 的，原地写会连带改动 store 里的同一份（影响其他使用同版本的项目），`rename` 只替换目录项、不动共享 inode，顺带获得写入原子性（中断的启动不会留下半截文件）。新增 6 个 `npm test` 回归用例：共享根、profile local、profile node_modules、共享根+profile 去重、无任何安装、profiles 目录缺失
- **v0.5.9**：**修复符号链接 / Junction 型技能查不到（对应 issue #6）**——扫描技能目录时 `readdir` 的 `Dirent` 走的是 lstat 语义：Windows 下符号链接**和 Junction** 都报告 `isDirectory() === false` / `isSymbolicLink() === true`，于是链接型技能（如 `~/.agents/skills/neat` → `D:\repos\icraft-toolkit\skills\neat`）在第 79 行的目录过滤里被静默 `continue` 掉。现在链接条目改用 `stat`（跟随链接）判定真实类型：链接型技能与普通目录**完全一视同仁**，断链或指向普通文件的链接安全跳过（不再抛错、也不占用列表）。四个扫描根（`~/.agents/skills`、`~/.dsh/skills`、项目级 `.agents/skills` / `.dsh/skills`）与 profile 枚举路径全部受益；新增 `npm test`（`node --test`）回归用例：普通目录、链接目录、链接+普通混排、断链、无 `SKILL.md` 的链接、项目级链接技能
- **v0.5.7**：**搜索结果按匹配相关度排序**——⚡ 面板与 `/` 补全统一：名字开头匹配 > 名字包含 > 描述 > 拼音，置顶/最近使用只做同级次序；同时过滤掉纯粹"字母分散"的子序列噪音（如搜 `svg` 不再混入 deepseek/openviking 等恰好含 s-v-g 分散字母的技能）。`svg` → svg-diagram 稳居第一
- **v0.5.6**：**AI 安装指引升级为「GitHub 直装优先」**——快速安装部分改为给 AI/安装助手的优先级决策树：①要最新版/不确定 → `git+ssh` GitHub 直装（git 依赖拉最新 commit，**天然绕过 npm 24h 门禁，百分百新版**）；②要 npm 正式版 → 先 `npm view` 查版本再指定 `@版本` 安装；③**禁止裸名安装**（24h 内会落回旧版）
- **v0.5.5**：**安装指引升级（AI 友好）**——README 快速安装改为「先 `npm view dsh-skill-picker version` 查版本号 → 再 `add dsh-skill-picker@版本号` 指定安装」，并给 AI/安装助手显式提示：新版本发布后 **24 小时内裸名安装会被 minimumReleaseAge 门禁拦截并自动落回旧版**，必须指定版本号才能装到最新
- **v0.5.4**：**斜杠选技能后 ⚡ 面板同步变「最近使用」**——修复双列表状态不同步：斜杠路径的 usage 记录此前只写 localStorage、面板组件不会刷新（React state 挂载后不再重读），现在 trackPick 写入后会广播 `usage-updated` 事件，⚡ 面板实时重读；面板每次打开时也强制刷新 usage。两条路径的选择现在**双向同步**
- **v0.5.3**：**官方 `/` 列表与 ⚡ 面板排序同步**——搜索时 fuzzysort 只决定「哪些技能入围」，入围后的显示顺序统一按 ⚡ 面板规则（置顶 → 最近使用 → 常用 → 其余）；之前 `/` 列表按匹配分数排序、⚡ 面板按使用记录排序，同一技能在两个列表的相对位置不一致；候选上限 12 → 30
- **v0.5.2**：**官方 `/` 菜单选技能也记录使用记录**——自愈补丁新增第三个 patch（`pick-tracking`）：官方 ui-skill 的 `onPick` 会调用插件的 `window.__dshSkillPickerTrack`，斜杠选中的技能与 ⚡ 面板点选一样进入「最近使用」排序（之前只有按钮路径记账，斜杠路径不记账）
- **v0.5.1**：**host 端自愈补丁**——每次 DSH 启动自动扫描所有 profile 的官方 `ui-skill` 包（local 副本或 npm 安装），自动应用两个升级补丁（`order: 2→-1` 技能组排到命令组之上；candidates 前缀匹配→模糊+拼音匹配），首次修改前自动备份 `.bak`，幂等且 DSH 升级覆盖官方包后自动重打。安装本插件即可获得官方 `/` 补全的完整增强，无需手动改文件（旧版 v0.4.0 的手动 patch 流程退役）
- **v0.5.0**：**⚡ 面板置顶分组 + 修复 alpha.5 草稿丢失 bug**
  - 新增**手动置顶**：面板按「📌 置顶 → 🔥 最近使用 → 🗂️ 全部」分组展示（浏览时显示分组标题，搜索时折叠为置顶优先的单一列表）；每条技能右侧 📍 按钮一键置顶/取消，置顶顺序固定、持久化到 localStorage；`/` 补全候选同步置顶优先
  - **修复严重 bug**：DSH alpha.5 重构后 `conversation.input.right` 插槽不再提供 `input` 快照，点选技能时误走「事件回调内调用 `useInput` hook」分支（违反 React 规则，抛错被吞 → 草稿读空 → **覆盖用户已输入的内容**）。改为渲染期把最新草稿同步到 ref，点击回调只读 ref——追加永远基于真实草稿
- **v0.4.0**：**单列表模糊搜索**——不再注册独立 `/` 候选源，改为 patch 官方 ui-skill 的 candidates（模糊+拼音注入，官方列表是唯一来源，无并列列表、无搜索冲突）；实测 `/jiyi` → 官方「技能」组 backup-memory 排第一
- **v0.3.4**：适配 DSH 0.1.2-alpha.5 —— 技能列表改用官方 `remote.skills` RPC（alpha.5 将 rc.x 的 `connection.api.skills` 改名），`/` 补全与 ⚡ 面板统一「官方 RPC → host 扫描兜底」；`dsh.client.inject` 声明 `dsh-client-ui-input-trigger`（alpha.5 装载器只给声明了提供者的插件暴露 `inputTriggers` 服务）。修复 alpha.5 下 `/` 模糊/拼音搜索失效（实测 `/jiyi` → backup-memory）
- **v0.3.3**：兜底扫描对齐官方全部技能根——补扫 user-agents 层（`~/.agents/skills`，含 `DSH_AGENTS_HOME`），扫描顺序与官方 rank 一致（项目级优先于用户级）；走兜底时 ⚡ 面板显示「本地扫描」来源徽标便于排障（对应 issue #5）
- **v0.3.2**：安装文档修正——实测三种安装方式并补网络特例（HTTPS 受限改 SSH、npm 新版本 24h 内被 minimumReleaseAge 门禁挡旧版的规避方法）
- **v0.3.1**：README 顶部新增一键快速安装命令（`dsh plugin --profile web add dsh-skill-picker`）与 npm 版本/许可徽章
- **v0.3.0**：拼音搜索——`/` 补全与 ⚡ 面板的搜索目标加入技能名/描述的拼音全拼（带空格+连打）与首字母索引，中文技能可拼音直搜（如 `ji yi` →「备份记忆」）
- **v0.2.2**：⚡ 弹层键盘导航（↑↓ 选择、Enter 插入、Esc 关闭）；按钮盒 28×28 → 24×24，闪电图标 16px（对应 issue #1、#4）
- **v0.2.1**：声明兼容 DSH 0.1.2-alpha 系列
- **v0.2.0**：注册为 `/` 补全候选源（fuzzysort 模糊匹配 + 最近/常用排序，排序规则与 ⚡ 面板统一）
- **v0.1.0**：初版——⚡ 按钮弹窗搜索点选技能

## 兼容性与注意事项

- **技能来源**：**优先走官方宿主 skills API**（`connection.api.skills.list`——与 DSH 内置 `/` 补全**完全同一个数据源**，会话作用域，自动覆盖全部官方目录）；官方 API 不可用时**自动回退**到内置扫描。两条路都支持 `DSH_HOME` 环境变量。
- **兜底扫描范围**：与官方 `dsh-skill-filesystem` provider 的默认根完全同源——项目级 `<workspace>/.dsh/skills`、`<workspace>/.agents/skills`，用户级 `~/.dsh/skills`、`~/.agents/skills`（`$DSH_AGENTS_HOME` 可覆盖），同名时按官方 rank 项目级优先。走兜底时 ⚡ 面板底部显示「本地扫描」徽标。
- **链接型技能**：技能目录里的**符号链接 / Junction**会被跟随读取（v0.5.9 起，对应 issue #6），链接型技能与普通目录一视同仁；断链、指向普通文件的链接静默跳过，不影响其它技能。
- **暂不支持**：自定义技能目录（官方 `customSkillDirs` 配置）——需要的话欢迎 PR。
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
