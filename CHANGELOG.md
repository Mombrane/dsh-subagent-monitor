# Changelog

本文件记录 `@leetoners/dsh-ui-subagent-monitor` 所有值得记录的变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-09-14

### Added

- **横向收起（向左折叠为窄栏）**：标题栏新增 `◂ / ▸` 开关，面板宽度在 340px 与 **120px** 之间切换。收起时**右边缘钉住不动**，因此视觉上是朝左折叠；面板被拖动过（带显式 `left`）时按 220px 差值补偿 `left`，保证折叠方向始终朝左而非朝右缩。窄 / 宽选择存 `dsh-smn.panel-narrow.v1`（页面级全局键，与位置同策略、跨会话共用），刷新后在首帧前回填，不会闪一下宽面板。
- 窄栏保留**上下文与主会话两枚环**（去掉子代理环），**保持原大小 48px 不缩小**，由左右一排改为从上到下一列：`.smn-summary-rings` 在窄模式下 `flex-direction: column`；子代理聚合信息由底栏彩色计数承接。
- 窄栏下部保留子代理运行框，改为紧凑卡片：状态点 + 标签一行、耗时右下角；「打开对话」按钮在 120px 下放不下，因此整张卡片变为 `<button>`（点任意位置即打开，带 `focus-visible` 轮廓与 hover 态，保持键盘与读屏可达），被省略的 provider / 模式 / 短 id 收进 `title`。

### Changed

- 横向收起与既有两段式纵向收起**正交**：窄栏内照样可以两级纵向收起（先收卡片列表、再收到只剩标题栏），两种收起互不干扰。
- 窄模式下标题文字「子代理看板」与「← 上一层」按钮让位（120px 只容得下状态徽标与三个图标按钮），纵向收起与关闭按钮改为纯图标 `▴ / ▾ / ✕`，并补 `aria-label`。
- 窄模式下撤掉状态柱状图（需要横向空间），计数由底栏的 `运行/完成/异常` 彩色三联数字接手（原文案进 `title`）；底栏两个维护按钮改为图标 `⤢ / ⌫`。

## [0.3.1] - 2026-09-14

### Added

- **DSH 兼容性逐版本声明**：`package.json` 新增 `dsh.compatibility`（DSH 范围 + `dshReleases` 精确矩阵）与 `engines`（Node.js 范围），README 双语同步新增「兼容性」小节并附实测方法。DSH STORE 的八小时复查只认完整 SemVer 的逐版本记录，宽泛范围不再算可安装证据。

### Fixed

- 修复 DSH STORE 的**兼容性暂时下架**（`DSH_LATEST_THREE_COMPATIBILITY_HOLD`，Issue #839）：固定 Commit 的 manifest 缺少精确兼容记录，目录条目被自动从 `approved` 转为 `unlisted`；补齐声明并提升插件 SemVer 后交由自动复查恢复上架。

## [0.3.0] - 2026-08-24

### Added

- 总体监控看板条：面板头部与卡片列表之间新增汇总条，实时显示当前层子代理的运行 / 完成 / 异常 / 子代理计数，以及聚合的模型用量（输入 / 输出 token）、缓存命中率、累计上下文与上下文窗口峰值利用率。
- 每张子代理卡片新增用量行：显示该 run 的输入 / 输出 token、缓存命中率、累计上下文与上下文窗口利用率（provider 上报时）。
- Node 半身用量采集：从每个子代理会话日志折叠 provider 上报的 TokenUsage（inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens），活会话读内存事件、冷会话经 `sessionPersistence` 读取一次并缓存；同 step 的 usage chunk 与最终 message 用量去重，逻辑对齐 `@deepseek-ai/dsh-token-meter` 的 tokenUsage + contextPressure 投影。
- 上下文窗口监控：`request/context` 记录模型 contextWindow，最新用量样本给出 prompt 侧压力；看板与卡片展示窗口利用率。
- 用量环形图：汇总条右侧新增纯 SVG 环形图（未缓存输入 / 缓存命中输入 / 输出三段，沿用 DSH deepseek 蓝色系 --dsw-static-deepseek-*），中心显示缓存命中率，下方配三段迷你图例；移除「缓存命中」「窗口峰值」文字单元格，由环形图承载。
- 主会话上下文窗口环：汇总条左侧新增 48px 环形图，代表当前查看主会话的上下文占用——弧长即**当前占用**（`projectedTokens`：最新 prompt 用量样本 + 表层启发式增减），外圈即窗口上限（`request/context` 的 contextWindow），中心显示当前占用占窗口百分比；无窗口上限时按已用上下文填充。压缩（progressive compaction）替换表层区间时按记录的 shadow price 收缩弧长，占用随之回落。
- 双缓存命中环：缓存命中环拆为两个 48px 小环——主会话一个、子代理独立聚合一个，中心均显示缓存命中率；置于上下文环右侧。
- 主会话用量采集：宿主对当前查看会话自身（而非仅子代理）折叠用量与上下文（窗口 / 压力 / 工具输出），快照路由新增 main 字段。

### Changed

- 面板标题由「当前层子代理」改为「子代理看板」；汇总条布局改为三个等大（统一 48px）环在左、数字列在右，上下文构成图例随数据出现。
- 汇总条右侧由文字计数列改为**状态柱状图**：移除与底部状态行重复的运行 / 完成 / 异常文字（含「子代理」总数与聚合 token 汇总），改为三根按状态着色的竖向柱（运行蓝 / 完成绿 / 异常红），高度按当前层最大计数等比缩放、柱下带计数与标签；左侧三枚环形图（主会话上下文窗口占用、主会话 / 子代理缓存命中率）保留。
- 「收起」改为**两段式**：第一次只收起下方子代理卡片、顶部总览看板保留（按钮变「全部收起」，底部状态栏与高度柄仍显示）；再点一次才收起到只剩标题栏；「展开」一步恢复完整面板。收起状态下不再套用记忆高度、面板自动收缩到内容高度，展开时恢复。

### Fixed

- 修复主会话上下文窗口显示恒为 100%：上下文环分子由**会话累计**的 `contextTokens`（随会话只增不减）改为**当前占用** `projectedTokens`（最新 prompt 样本 + 表层启发式变动，`compaction/summary` 按 shadowedTokenCount 武装索赔、紧随的 surface `replace` 消费并扣减，压缩后立即回落）；卡片「窗口」利用率同步改读当前占用。移除累计口径的三段构成图例。
- 修复空状态（本会话暂无子代理活动 / 尚未选择会话）下面板调高时只有外框变高、内容不动：空状态区 `.smn-empty` 与卡片列表一样占用弹性中段（`flex: 1`），面板拉高后底部「运行 · 完成 · 异常」统计栏与高度柄跟随下移、空文案在弹性区内垂直居中，不再在柄下方留下死区。
- 修复空状态下面板缩到最小高度时底部统计栏与高度柄被裁掉、无法再拉出：最小高度由 160px 抬至 240px（不低于空状态自然内容高度，header+summary+empty+footer+grip ≈ 226px，避免 `overflow: hidden` 把底部裁出框外），且 `.smn-empty` 设 `min-height: 0` 吸收一切高度差额——统计栏与高度柄在任何高度都保持可见可拖。

## [0.2.0] - 2026-08-17

### Added

- 面板拖动：标题「运行中的子代理」左侧新增拖动柄（四角箭头图标），按住可自由移动面板；位置写入 localStorage，刷新 / 重启浏览器后恢复；双击复位到默认右上角。
- 面板高度调节：底部新增横向拖动柄（统计栏与底边之间），上下拖动改变面板高度（最小 160px）；高度写入 localStorage，双击复位。
- 布局记忆拆分：面板**位置跨会话保留**（单键 `dsh-smn.panel-position.v1`，所有会话共用），**高度按会话隔离**（`dsh-smn.panel-height.v2.<sessionId>`，无会话时用 `__global__` 桶）——切换会话位置保持一致，面板大小互不影响。
- 运行状态点对齐 DSH 侧栏 tab 原生 `StateDot`（ui-primitives 规格）：运行中为蓝色像素追逐动画（10×10 SVG、3×3 外圈 8 个 2×2 像素格顺时针逐格点亮、阶梯亮度衰减、负延迟相位）；终态为实心点 + 10% 同色光晕（完成绿 / 失败红 / 中断·令牌上限·拒绝琥珀 / 已结束中性灰）。

### Changed

- 面板改为逐层查看：只显示当前会话直接派生的子代理；打开子代理会话后，面板展示其直接子代理，不再在父会话中级联显示孙代。事件归因与历史回填统一按直接父会话（`listChildren`）；返回按钮改为「← 上一层」，跳回直接父会话。

### Fixed

- 修复树形缩进导致卡片宽度不一致：随逐层查看一并移除层级缩进，卡片统一等宽（`box-sizing: border-box` 保证外框一致）。
- 修复面板打开时 `shell.overlay` slot 崩溃（React #310）：`useRef` / `useEffect` 曾被放在 `!open` 提前 return 之后，导致 hook 数量在两次渲染间不一致；已移至提前 return 之前。
- 修复拖动柄在空面板 / 合成指针环境下无效：拖动监听改为 window 级指针监听，不再依赖 `setPointerCapture`（注入的合成指针事件没有活动指针，capture 会抛错导致拖动从未启动）。
- 修复收起面板后仍保持拉高高度（内容收起但面板框不缩）：最小化时不再套用显式高度，面板缩回标题栏，展开后恢复记忆高度。

## [0.1.0] - 2026-08-15

### Added

- 卡片化实时面板：运行中（🔵 蓝色呼吸 + 秒表）、完成、失败、已打断、令牌上限、已拒绝、已结束（历史回填，结局未观测）。
- 侧栏底部「子代理」入口 + 右上角常驻面板；孙代子代理树形缩进。
- 「打开对话」跳转子代理会话 + 「← 主会话」一键返回。
- 刷新 / 服务重启后自动恢复（常驻组合 + 持久目录历史回填）。
- 移动端策略（≤768px 视口默认不弹出，侧栏入口仍可打开）。
- `dsh.bundle` 官方安装通道（`cordis.patch.yml`），支持 `dsh plugin add`。
- `AGENTS.md`：仓库常驻规则（文档与代码同 PR 同步、双语配对、版本对齐、决策状态约定）。
- `README.en.md`：英文 README，与中文版双语配对。
- 文档门禁 `scripts/verify-docs.mjs` + GitHub Actions（版本 / CHANGELOG 一致、双语配对、相对链接检查）。
- PR 模板（`.github/PULL_REQUEST_TEMPLATE.md`）：文档同步 checklist。
- README 面板截图（`docs/screenshot.png`，中英双语）。
- npm 发布流水线（`.github/workflows/publish.yml`）：tag 推送自动发布 + provenance。

### Changed

- npm 发布 scope 由 `@mombrane` 改为 `@leetoners`（发布组织 leetoners）。

### Fixed

- `peerDependencies` 中 DSH 包版本范围放宽至 `>=0.1.0-rc.0`（公共 npm registry 目前仅有 rc 预发布版，原 `>=0.1.0` 无法解析）。
- 重建陈旧 `lib/` 产物：包名迁移至 `@leetoners` 后未重新构建，仓库内 `lib/client.js` 仍含旧 scope；已重构建并对齐（npm tarball 不受影响，发布流水线有 `prepare` 重建）。
- 文档门禁新增 `lib/` 新鲜度检查（产物须包含当前包名）。
