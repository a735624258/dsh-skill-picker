# 更新日志

> 每个版本的详细说明同步自 [GitHub Releases](https://github.com/a735624258/dsh-skill-picker/releases)；首页 [README.md](README.md) 只留最近 3 条。

## 版本速览

| 版本 | 一句话 |
|---|---|
| **v0.5.28** | 新置顶的技能排到「置顶」分组的最前面（npm 当前最新） |
| **v0.5.27** | 手机端「插完技能光标不回」的配套豁免牌 |
| **v0.5.26** | ⚡ 面板可管理技能（右键菜单）+ 12 项细节修复 |
| **v0.5.25** | 面板弹出位置改成贴窗口右边缘 |
| **v0.5.24** | 去掉面板底部两个诊断徽标（搬进 tooltip + 控制台） |
| **v0.5.23** | ⚡ 面板里可直接管理技能：置顶 / 关闭 / 定位 / 卸载（可撤回） |
| **v0.5.22** | 置顶与最近使用跨端共用一份；修「打 `/` 菜单开到下面去」 |

> v0.5.28 之后只做过两处**纯文档**改动（隐私清理、README 重构），**不单独占版本号**。

## 各版本说明

## v0.5.28 — 新置顶进最前（修置顶顺序）

### 一句话

新置顶的技能现在排到「置顶」分组的**第一行**，和微信 / Notion 的置顶行为一致。

### 为什么要改

有用户反馈："后面置顶的为什么排在置顶列表的最后面呢？按理来说，后面置顶的应该排在置顶列表的最前面才对呀" —— 他是对的：写入侧 `togglePin()` 用的是 `[...pinned, name]`（追加到末尾），而渲染侧直接按数组顺序输出「置顶」分组。

### 改了什么

1. 写入侧从「追加到末尾」改成「插到最前」：`[name, ...pinned]`
2. 渲染侧不动 —— 它本来就是按数组顺序渲染，所以一行修复就够了

### 怎么验证

- `npm test` → **88 tests / 87 pass / 1 skipped / 0 fail**
- 实机：取消一个已置顶的技能 → 重新置顶它 → 出现在「置顶」分组第一行
- 备注：已在置顶列表里的旧顺序不会自动重排（存的是老的追加顺序），想调整顺序就「取消 → 重新置顶」
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.28`

---

## v0.5.27 — 手机端光标豁免牌（配合 dsh-pocket「切会话不抢焦点」补丁）

### 一句话

手机上选完技能，光标照常回到输入框 —— 与 `dsh-pocket` 的「切会话不抢焦点」补丁配套。

### 为什么要改

`dsh-pocket` 新补丁把「程序自己抢的焦点」一律退回，而本插件的 `focusComposer()` 本身**就是**有意为之的主动聚焦（选完技能就该把光标放回输入框）→ 于是「插完技能光标不回来」在手机上复发。

### 改了什么

1. `focusComposer()` 在聚焦前写一个时间戳：`window.__dshSkillPickerFocusing = Date.now()`
2. 拦截器看到 **1.2 秒内**的这个时间戳就放行
3. 用时间戳而不是布尔值：紧随其后还有一次 60ms 的守卫重定位，一次设值同时覆盖两次聚焦，也不需要清理、不会漏复位

### 怎么验证

- `npm test` → **88 tests / 87 pass / 0 fail**
- ⚠️ **两个补丁是一对**：只装本插件 → 手机上「切会话仍会抢焦点」；只装 pocket 侧 → 「插完技能光标不回来」；两边都装才两个都对
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.27`，装完重启 DSH

---

## v0.5.26 — ⚡ 面板可管理技能 + 12 项细节修复

### 一句话

⚡ 面板里**右键**（手机长按）就能管理技能：置顶 / 关闭 / 在文件管理器中定位 / 卸载（可撤回）。

### 为什么要改

官方 DSH 没有任何技能管理界面 —— 把 asar 里 289 个官方包全扫过一遍，没有禁用 / 卸载技能相关代码；视频评论区也有人问"能加一个管理 skill 功能吗？实现删除、加、启动、关闭等操作"。这块是真空白。

### 改了什么

1. **右键技能行**（手机长按 500ms，滑动即取消）弹菜单：置顶 / 关闭 / 定位 / 卸载
2. **「关闭」是真关闭**：`SKILL.md` → `SKILL.md.disabled`，provider 直接看不见、`agent` 也不再加载；从右下角「已关闭 N」入口随时开回来
3. **「卸载」从不删除**：移进 `$DSH_HOME/skill-backups/<时间戳>-<技能名>/`（附 `manifest.json` 记原路径），面板里出现「撤回」
4. **12 项细节修复**（全部来自实机反馈）：光标落回输入框末尾、右键菜单跟随主题且实心、提示条自动消失（普通 2.6 秒 / 带撤回 10 秒）、字体统一到 `--dsw-font-family`、去掉全部 emoji、修「已关闭的技能仍出现在主列表」、搜索框无边框 32px
5. **路由三道闸**：必须带自定义头 `x-dsh-skill-picker: 1`；客户端只报技能名、路径由宿主自己查；路径必须恰好落在已知技能根的一层之下

### 怎么验证

- `npm test` → **88 tests / 87 pass / 0 fail**
- 实机（全程只用自建假技能）：关闭后磁盘上是 `SKILL.md.disabled` ✓、扫描仍能列出且 `disabled:true` ✓、开启还原 ✓、卸载后备份里 `SKILL.md` + `manifest.json` 完整 ✓、撤回回原位 ✓、不带自定义头 → 403 ✓、`name` 塞 `../` → 404 ✓
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.26`，装完重启 DSH

---

## v0.5.22 — 置顶跨端共用一份 ＋ 修「/ 菜单开到下面去」＋ 文件补丁退休

### 一句话

置顶与最近使用在**桌面端 / 网页端 / 手机之间共用同一份**；顺带修掉「打 `/` 菜单开到下面去」，并让文件补丁正式退休。

### 为什么要改

`localStorage` 按源隔离 —— 桌面端是 `dsh-app://app`、网页端是 `http://127.0.0.1:3080`、手机连上去又是第三个源，**同一份数据被存了三遍**，所以在桌面端钉的技能网页端永远看不到。

### 改了什么

1. 状态改存宿主侧 `$DSH_HOME/dsh-skill-picker-state.json`，host 新增 `/dsh-skill-picker/state`（GET / PUT）；**首次同步取并集**（谁也不会吃掉谁的钉子），之后跟随文件，所以在 A 端取消置顶能真的传播到 B 端
2. `/` 菜单的空查询也交给同一套排序（以前空查询被短路 → 纯字母序、置顶不在最前）；⚡ 面板与 `/` 菜单从此同源同序
3. 修「打 `/` 菜单开到下面去、高亮不在第一条技能」：这是 **microtask 跳数的比赛**，不是网络快慢 —— 技能组必须命中自己的缓存、**0 个 `await` 直接返回**才抢得到高亮
4. **文件补丁退休**：默认不再改任何官方文件，并自动把以前改过的从 `.bak` 还原（temp + rename，绝不动 pnpm 硬链接的共享 inode）；只有显式设 `DSH_SKILL_PICKER_FILE_PATCH=1` 才走旧的自愈路径

### 怎么验证

- `npm test` → **75 tests / 74 pass / 0 fail**（1 skip 是 Windows 建符号链接需权限那条）
- 全程 best-effort：host 不可达时行为和以前完全一样，不会因为同步失败把选择器弄坏
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.22`，装完重启 DSH

---

## v0.5.10 — 修复全局安装下 / 补全增强静默失效（issue #7）

### 一句话

用全局 `npm i -g @deepseek-ai/dsh` 安装时，`/` 补全的模糊 + 拼音增强不再**静默失效**。

### 为什么要改

对应 **issue #7**（感谢 @aizhimoran 的报告：根因、证据、修法全都给了）。官方包在**共享根** `$DSH_HOME/profiles/node_modules/...`，而候选路径只枚举了 `profiles/<profile>/...` 两处 → 一个都没命中 → 补丁一次都没跑，而且**完全无声**：`{"files":[],"errors":[]}` 与「补丁都已应用、全部 skipped」在输出上一模一样。表现成「插件一切正常、技能列表能用，**就是拼音 / 模糊搜索是坏的**」。

### 改了什么

1. 候选新增**共享根** `profiles/node_modules/...`（不属于任何单个 profile，放在 profile 循环外采集）
2. 每个 profile 额外走一次 `createRequire().resolve()` 兜底，未枚举到的布局也能命中（按 realpath 去重）
3. 跳过 `profiles/node_modules` 这个**假 profile** 条目
4. **零目标时 `console.warn` 大声报出** —— 这个静默正是 issue #7 里最坑人的地方
5. 写入方式改为**临时文件 + `rename`**：pnpm 装的包是硬链接到共享 store 的，原地写会连带改动 store 里的同一份；`rename` 只替换目录项，顺带获得原子性

### 怎么验证

- 新增 6 个用例（`test/patch-paths.test.mjs`）：共享根 / profile 内 local / profile 内 node_modules / 三种同时存在去重为 1 / 什么都没装 / `profiles` 目录不存在
- 全量：**11 通过 / 0 失败 / 1 跳过**
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.10`

---

## v0.5.7 — 🔍 搜索结果按匹配相关度排序

### 一句话

搜索结果按**匹配相关度**排序：名字开头匹配 > 名字包含 > 描述命中 > 拼音命中。

### 为什么要改

`/` 菜单之前用 fuzzysort 只决定"谁匹配"，排序仍按最近使用 —— 于是名字**完全匹配**的 `svg-diagram` 会被最近用过的技能压到后面。

### 改了什么

1. 相关度优先；置顶 / 最近使用只做**同级内**的次序
2. 过滤纯字母分散的子序列噪音：搜 `svg` 不再混入 deepseek / openviking 这类恰好含 s、v、g 三个分散字母的技能
3. ⚡ 面板与 `/` 补全统一同一套规则

### 怎么验证

- 搜 `svg` → `svg-diagram` 稳居第一
- 拼音搜索不受影响：`ji yi` / `duo xuan` / `beifen` 正常命中
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.5.7`，装完重启 DSH

---

## v0.4.0 — 单列表模糊搜索（patch 官方 ui-skill）

### 一句话

`/` 菜单里的技能列表换成**模糊 + 拼音**匹配，而且官方「技能」分组仍然是唯一那个列表。

### 为什么要改

v0.2.0 – v0.3.4 注册了一个独立的 `/` 候选源，与官方列表**并列** —— 菜单里出现两个技能分组、搜索行为互相冲突。

### 改了什么

1. 不再注册独立源，改为增强官方 `dsh-client-ui-skill` 的 candidates：把前缀匹配（`startsWith`）升级为模糊 + 拼音（fuzzysort + pinyin-pro + 最近 / 常用排行）
2. 官方规则全部保留：`userInvocable` 区分、菜单文案、「仅用户可调用」等都由官方代码继续管
3. 当时的部署方式（**后来已废弃**）：官方包拷到 `profiles/<profile>/local/dsh-client-ui-skill/`，profile 的 `package.json` 加 `link:`，`pnpm install` 后重启 DSH

### 怎么验证

- `/jiyi` → `backup-memory`（备份记忆）排第一；`/duo xuan` → `duo-xuan-pi-gai`
- 无第二列表、无搜索冲突
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.4.0`
- ⚠️ 这条「改官方文件」的路线自 **v0.5.15** 起已被「运行时接管」取代 —— 现在默认不改任何官方文件

---

## v0.3.4 — 适配 DSH alpha.5：remote.skills + inputTriggers

### 一句话

跟着 DSH `0.1.2-alpha.5` 的改名走：技能列表切到 `remote.skills`，`/` 的模糊 + 拼音搜索恢复。

### 为什么要改

rc.x 里的 `connection.api.skills` 在 alpha.5 **改名成 `remote.skills`** → 取不到技能列表，`/` 的模糊 / 拼音搜索直接失效。

### 改了什么

1. 技能列表改用官方 `remote.skills` RPC（与官方 ui-skill 同源），同时保留 `connection.api.skills` 兼容
2. `/` 补全与 ⚡ 面板统一为「官方 RPC → host 扫描兜底」的降级链
3. `dsh.client.inject` 里声明 `@deepseek-ai/dsh-client-ui-input-trigger` —— alpha.5 的装载器只给声明了提供者的插件暴露 `inputTriggers` 服务

### 怎么验证

- Playwright 实测：输入 `/jiyi` → 技能分组正常弹出，`backup-memory`（备份记忆）排第一 ✓
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.3.4`，装完重启 DSH

---

## v0.3.3 — 兜底扫描对齐官方技能根（issue #5）

### 一句话

兜底扫描补上 user-agents 层，**扫描顺序与官方 rank 完全一致**。

### 为什么要改

官方 skills API 不可用时会走兜底扫描，但当时漏了 `~/.agents/skills` 这一层 —— 放在那里的技能在 ⚡ 面板里**一支都看不到**（对应 **issue #5**）。

### 改了什么

1. host 的 `scanSkills` 对齐官方 `dsh-skill-filesystem` 的全部技能根：`<cwd>/.dsh/skills`、`<cwd>/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills`（`$DSH_AGENTS_HOME` 可覆盖）
2. 扫描顺序与官方 rank 一致：project-dsh > project-agents > user-dsh > user-agents
3. 走兜底时 ⚡ 面板显示「本地扫描」来源徽标，方便排障
4. README 的兜底扫描范围同步更新

### 怎么验证

- 把技能放进 `~/.agents/skills`，面板能列出（之前列不出）
- 同名技能同时存在时，项目级覆盖用户级
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.3.3`

---

## v0.3.2 — 📄 安装文档实测修正

### 一句话

三种安装方式**逐条实测**过一遍，把踩到的坑写进文档。

### 为什么要改

README 里的安装说明此前没有实测依据 —— 照文档装可能直接失败，或者装到旧版还找不到原因。

### 改了什么

1. 方式一 `clone + link`：✅ 有效（以本机 link 模式为证）
2. 方式二 `github:` 简写：⚠️ 实测 pnpm 会强制 HTTPS clone，HTTPS 受限环境（如只有 SSH 通道）会失败 → 补上 `git+ssh://` 替代写法
3. 方式三 npm 裸名：⚠️ 新版本发布后 24 小时内会被 pnpm 的 `minimumReleaseAge` 门禁挡到旧版 → 补上 `dsh-skill-picker@版本号` 的写法

### 怎么验证

- 三种方式各跑一遍，结果逐条记进 README
- 纯文档改动，**无代码变更**

---

## v0.3.1 — 📄 README 快速安装 + 徽章

### 一句话

README 顶部加了「一键快速安装」和 npm / 许可徽章。

### 为什么要改

想装这个插件，得先把整篇 README 读完才知道命令是什么；README 上也没有版本号和许可标识。

### 改了什么

1. 顶部新增一键安装：`dsh plugin --profile web add dsh-skill-picker`
2. 新增 npm version / license 徽章
3. 更新日志补上 v0.3.1

### 怎么验证

- 纯文档改动，**无代码变更**
- 页面打开即见徽章与安装命令

---

## v0.3.0 — 🔤 拼音搜索

### 一句话

中文技能不用记字 —— 打拼音就能搜到：`ji yi` / `jiyi` / `jy` 都行。

### 为什么要改

技能名是 kebab-case 英文（如 `backup-memory`），中文用户记不住；此前只能打对前缀字母才过滤得出来。

### 改了什么

1. 技能名和描述都生成拼音索引（全拼带空格 / 连打 / 首字母三种打法），按技能缓存
2. `/` 补全与 ⚡ 面板**同步**支持拼音过滤
3. 拼音索引由 `pinyin-pro` 生成，打包进 client bundle，**零额外运行时安装**

### 怎么验证

- `ji yi` / `jiyi` / `jy` → 「备份记忆」（`backup-memory`）
- `beifen` → `obsidian-backup` / `backup-memory`；`duo xuan` → `duo-xuan-pi-gai`
- 安装：`dsh plugin --profile web add dsh-skill-picker@0.3.0`，装完重启 DSH

---

> 更早或中间的版本（v0.5.9、v0.5.11–v0.5.21、v0.5.23–v0.5.25）当时只推了 tag、没写 Release 说明，这里不收录。
