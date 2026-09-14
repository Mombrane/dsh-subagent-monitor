# 架构说明（中文版）

> 本文回答三个问题：**它是什么、为什么这么做、它是怎么运转的**。
> 面向对象：想要理解、修改或二次分发本插件的开发者。
>
> **决策状态约定**：本文的设计决策被后续变更取代时，保留原文，在小节标题后标注
> `（已被 §x.x 取代，YYYY-MM-DD）`，并把新决策写入对应小节；本文件与行为/架构变更同 PR 更新。

---

## 1. 概览

`dsh-subagent-monitor` 是 DeepSeek Harness（DSH）Web 界面的**常驻扩展插件**，
给用户一块实时面板，回答一个问题：

> “此刻，我（这个会话里的 Agent）正在派哪些子代理？它们各自处于什么状态？”

它在侧栏底部注册「子代理」入口（带运行中数量徽标），点击后在屏幕右上角
打开面板（v0.2 起可拖动、可调高）。面板里每个子代理是一张独立卡片：
蓝色像素追逐状态点 + 秒表（运行中）、绿色状态点 + 耗时（完成）、红色
状态点（失败）、琥珀状态点（打断 / 令牌上限 / 拒绝），以及中性的
「已结束」（历史回填、结局未观测）——状态点均对齐 DSH 侧栏 tab 的
StateDot 规格（终态为实心点 + 10% 同色光晕）。面板只显示当前会话**直接**
派生的子代理，最新派生的在最上面；打开其中一项后，面板切换为展示该子代理
直接派生的下一层，卡片上「打开对话」可跳转到对应会话。

面板顶部是一块总体监控看板，聚合当前层所有子代理的运行 / 完成 / 异常计数与
模型用量（输入 / 输出 token）、缓存命中率、累计上下文与上下文窗口峰值利用率；
每张卡片下方另附一行用量明细（该 run 的输入 / 输出、缓存命中、上下文大小）。

### 关键数字

| 项 | 值 |
| --- | --- |
| 面板位置 | 默认右上角 top:80px / right:16px，宽 340px；标题左侧拖动柄可移动，位置记忆（localStorage，跨会话保留） |
| 面板高度 | 默认 max-height:min(560px, 100vh−160px)；底部拖动柄可调（最小 160px），高度记忆（按会话隔离） |
| 刷新频率 | 1 秒轮询（粗粒度 start/end 事件下足够“实时”） |
| 历史保留 | 每个直接父会话最多 200 行，超出按最旧淘汰 |
| 用量采集 | 从子代理会话日志折叠 provider TokenUsage（活会话内存 / 冷会话持久化一次并缓存） |
| 移动端 | ≤768px 默认不弹出（侧栏入口仍在） |

---

## 2. 设计决策与理由

### 2.1 为什么做成“常驻插件”而不是“动态插件”

DSH 支持两种扩展：动态 Cordis 插件（`cordis_define`/`cordis_run`）与常驻
组合插件（package + 组合行）。动态插件有一个硬约束：**每次页面刷新后，
客户端运行时干净启动，直到再次显式 dispatch 才恢复**。对一块“实时监视”
面板来说，刷新即消失不可接受；而常驻组合行随服务启动加载，刷新、重启
后自动恢复。因此最终形态是常驻插件。

### 2.2 为什么自建 HTTP 轮询路由，而不是接入 apiproxy

浏览器半身需要实时数据，但客户端没有 Host 事件推送通道。两个候选：

- **接入 apiproxy**：改动网关级插件，侵入面大，且本轮目标明确要求“不动
  现有组合、独立成包”。
- **自建路由**：Node 半身注入 `webServer`，注册
  `GET /api/subagent-monitor/snapshot`，自包含、可精确控制，升级不碰网关。

选了后者。路由直接挂到 DSH Web 服务端口下（回环 `127.0.0.1`），浏览器端
`fetch` 同源即可，不引入 CORS。

### 2.3 为什么事件要“全局监听 + 父链归因”（已被 §2.11 取代，2026-08-17）

`subagent/start` 与 `subagent/end` 事件按**委托方（父会话）的作用域**分发：
谁派生的，事件在谁的组合作用域里可见。而本插件挂在根组合上（不属于任何
会话作用域），用 `{ global: true }` 监听后收到的是**全进程**的事件流。

因此 Node 半身对每个 run 走一遍
`session.header.parentSession` 父链，把事件归因到最顶层（根）会话。
面板只展示“当前会话的森林”，而不是整个进程的噪声。

### 2.4 为什么事件要合并 `subagents.listDescendants`（已被 §2.11 取代，2026-08-17）

- 事件载荷里没有 label、mode、depth 等展示字段，持久化目录里有；
- 服务重启后内存事件仓库清空，但子代理记录在持久目录里——合并它
  等价于免费的**历史回填**，刷新 / 重启后面板仍能显示进行中或已结束
  的子代理。

合并结果中新派生优先（`startedAt ?? sortKey` 降序）。

### 2.5 为什么存在「已结束」这个中性状态

历史回填的行没有观测到结局事件，无法判定成功 / 失败。如实标注“已结束”
优于猜测；状态图标为中性灰色圆点，提示“结局未观测”。

### 2.6 为什么取消拖拽（已被 §2.8 取代，2026-08-17）

初版面板可拖动，但每次 `pointermove` 触发全面板 React 重渲染，在低性能
机器上明显卡顿。改为固定位置后彻底根治；这也是 2.1 中“固定面板”的来源。

### 2.7 为什么发布时改中立包名 + 补 `dsh.bundle`

- 包名 `@leetoners/dsh-ui-subagent-monitor`，不占用 DeepSeek 官方
  `@deepseek-ai/*` 命名空间；
- 官方文档判定“可安装插件”的标准是包内带 `dsh.bundle`（含
  `cordis.patch.yml`）；只声明 `dsh.client` 的包会在安装时被拒。

`cordis.patch.yml` 在组合中插入一行：

```yaml
- insert:
    - id: ui-subagent-monitor
      name: '@leetoners/dsh-ui-subagent-monitor'
```

### 2.8 为什么拖拽重新引入，但只用专用拖动柄 + 直改 DOM

§2.6 的卡顿根因不是“拖拽”本身，而是**每个 `pointermove` 都走 React 状态
重渲染**。v0.2 重新引入拖拽，但换了实现路径：

- **专用拖动柄**：标题「运行中的子代理」文字左侧的小手柄（移动面板位置）、
  底部横向柄（调整高度），只有按住柄才触发，不再整面板响应；
- **拖动期间直改 DOM**：`pointermove` 里直接写 `panel.style.left/top/height`，
  不经过任何 React state——1s 轮询触发的常规重渲染会从模块级 `layout`
  读出相同数值，无视觉跳变；
- **监听器挂在 window 上**：拖动手势期间在 `window` 上挂 `pointermove` /
  `pointerup` / `pointercancel`，不依赖 `setPointerCapture`——注入 / 合成
  指针事件没有活动指针，capture 会抛错导致拖动从未启动（ego 等合成输入
  环境实测踩坑）；
- **释放时持久化（双策略）**：位置写入全局单键
  `dsh-smn.panel-position.v1`（**跨会话保留**同一位置）；高度写入
  `dsh-smn.panel-height.v2.<sessionId>`（**按会话隔离**，无会话时落入
  `__global__` 桶——切换会话换桶，面板大小互不影响）。载入与窗口 resize
  时钳制进视口；
- **双击复位**：双击任一拖动柄清空对应布局，回到默认右上角 / 默认高度；
- **两段式收起高度**：`collapse` 为三态（`none` 完整面板 / `rows` 只收起子
  代理卡片、顶部总览看板保留 / `all` 收起到只剩标题栏）。任一收起态
  （`rows` / `all`）都不套用显式记忆高度，面板自动收缩到内容高度；展开回
  `none` 时恢复记忆高度；collapse 翻转时命令式同步一次样式——React 的
  style diff 无法清除拖动期间直改 DOM 的样式键（上一次渲染的 style 对象
  里根本没有这些键，diff 视为"无变化"）。

### 2.9 为什么运行状态点改成“渐变扫光方块”（已被 §2.10 取代，2026-08-17）

会话框的「思考中」指示器（`TurnStatus`）用 deepseek 蓝渐变扫光：`500 → 200
→ 500` 的 90° 渐变 + `background-size: 250%` + `background-position` 从
100% 线性扫到 0，1.8s 循环。面板运行点原先的“圆形呼吸”是自创的近似，
观感与会话框不一致；v0.2 改为**圆角方块 + 同款渐变扫光**，视觉语言与会话框
对齐，并同样遵循 `prefers-reduced-motion`（弱动效偏好下静止显示渐变）。

### 2.10 为什么状态点最终对齐侧栏 tab 的 StateDot

§2.9 的渐变扫光方块取自聊天消息流里的 TurnStatus 文字渐变；但用户对照
DSH 前端后发现，与**左侧 tab 栏**（会话/子代理列表）的原生状态图标差异
巨大。侧栏 tab 的进行态是 `ui-primitives` 的 `StateDot` 像素追逐动画
（3×3 外圈 8 个 2×2 像素格顺时针阶梯点亮），完成态是实心点 + 10% 同色
光晕。监视面板展示的正是会话/子代理的运行状态，语义与侧栏 tab 一致，
因此最终按 `StateDot` 规格复刻：

- 运行中行 = `ongoing` 追逐（`--dsw-static-deepseek-450` 蓝，1s 阶梯
  keyframes，每格负延迟 `(index-8)*125ms` 保证挂载即动画）；
- 终态 = 点 + 光晕（`::before` 10% 同色 + `::after` 6/10 实心核），颜色
  走同一组 `--dsw-alias-state-*` token（完成绿 / 警告琥珀 / 错误红）；
- 「已结束」回填行沿用该形态的灰点（DSH tab 无此态，保留中性标记）。

---

### 2.11 为什么只展示当前会话的直接子代理

初版沿 `parentSession` 父链把事件归到根会话，并合并
`subagents.listDescendants`，因此主会话面板会显示整棵递归子树。子代理继续
派生时，孙代卡片也会混入主会话的列表；这既拉长了面板，也让“当前会话正在派谁”
的语义变得不清晰。

改为按**直接父会话**归因：

- 事件仓库按子代理 `header.parentSession` 的一跳父会话分区；
- 历史回填改用 `subagents.listChildren(sessionId)`，天然不枚举孙代；
- 面板只显示当前会话直接委托的子代理。打开一张卡片进入子代理会话后，面板
  自动展示该会话自己的直接子代理，形成明确的逐层下钻；
- `parentId` 仍通过 wire payload 保留，`openSubagent` 与后续 interrupt
  操作始终使用直接父会话地址。

这使面板的统计、容量上限和操作授权都以同一条直接父子关系为准。

### 2.12 为什么用量从子代理会话日志折叠（而不是事件 / 目录）

v0.2 的看板只有运行状态，用户需要更进一步的「整体看板」：模型用量、上下文
大小与缓存命中。DSH 的三个候选数据源里：

- **`subagent/end` 事件**：只有 `stopReason` 与可选 `lastAssistantMessage`，
  不带任何用量字段（调研见 `dsh-host-subagent-api-report.md`）。
- **`listChildren` / `listDescendants` 目录**：只有 label / mode / activity /
  hasChildren，同样没有 token 数据。
- **子代理会话日志**：`assistant/message` 事件携带 `usage?: TokenUsage`
  （inputTokens / outputTokens / cacheReadTokens / cacheWriteTokens），
  `request/context` 携带 `contextWindow`，且全部随日志持久化。

结论：用量只能从每个子代理自己的会话日志折叠。实现自包含复刻
`@deepseek-ai/dsh-token-meter` 的 tokenUsage + contextPressure 投影（同 step
的 usage chunk 与最终 message 用量去重、prompt 侧压力 = input + cacheRead +
cacheWrite），不引入对该包的依赖；活会话读 `ctx.sessions.get(id).events`
（内存，增量折叠），冷会话经可选 `sessionPersistence` 的 `inspect` 读取一次并
缓存（按事件水位推进，之后每次轮询 O(1)）。这使看板在服务重启、历史回填后仍能
还原用量；缺失可选服务或适配器未上报时优雅降级为「无用量」。

### 2.13 上下文环显示「当前占用」而非会话累计（2026-08-21）

上下文窗口的语义是**当前**占用——下一个请求的 prompt 会花多少，而不是会话累计
喂过多少。早期实现把累计的 `contextTokens`（input + cacheRead + cacheWrite
逐请求累加）当环的分子，随会话只增不减，长会话或压缩场景下必然贴死 100%；
「压缩了还是 100%」就是该口径的直接后果——压缩只腾出**当前**上下文，清不掉累计
计数器。

修法对齐 token-meter 的 `contextPressure.projectedTokens`：分子 =
`max(0, 最新 prompt 样本 + 表层启发式增减)`。表层增减走与主仓相同的 shadow-price
协议——`compaction/summary` 按 `shadowedTokenCount` 武装一条索赔，紧随其后的
surface `replace` 事件消费该索赔并扣减表层总价，因此压缩替换旧区间的那一刻占用
立即回落（复放真实日志验证：旧口径 1009% → 新口径 10.6%）。

`contextTokens` 仍随 payload 下发，供「上下文」数字单元格 / 卡片行的**累计**
口径使用；窗口环与「窗口」利用率统一读 `projectedTokens`（缺省回退
`pressureTokens`，再回退累计值以兼容旧宿主）。

### 2.14 为什么横向收起是独立布尔量，而不是扩展 `CollapseLevel`（2026-08-25）

纵向收起已经是三态枚举 `CollapseLevel = 'none' | 'rows' | 'all'`。横向收起最省事
的做法是往这个枚举里塞 `'narrow'`，但那会把两个**正交**维度压进一个变量：用户在
窄栏里仍然要能两级纵向收起（先收卡片、再收到只剩标题栏），一旦共用枚举，
"窄 + 收卡片" 这种组合就无法表达，必须再引入 `'narrow-rows'`、`'narrow-all'`
这类组合态，状态数从 3 变 6 且每处判断都要改写。

因此新增独立的 `narrow: boolean`，与 `collapse` 并存：宽度由 `narrow` 决定、
纵向内容由 `collapse` 决定，两者笛卡尔积天然成立，既有的 `collapse` 判断一行不改。

**折叠方向靠锚点而非动画实现。**「向左收起」的要求等价于 *右边缘不动*。面板默认
就是右锚定（`right: 16px`，见 §2.8 的布局双策略），此时纯粹把 `width` 从 340px
改到 120px，右边缘自然钉住、左边缘朝右移 —— 视觉上就是朝左折，零额外代码。
但面板被拖动过之后带的是显式 `left`（左锚定），同样的宽度收缩会变成"左边不动、
右边朝左缩"，方向感相反。所以 `toggleNarrow()` 只在 `layout.left !== null` 时
补偿：`left += (340 - 120)`，收起后右边缘仍落在原处；展开时反向补偿。宽度常量
`WIDE_WIDTH` / `NARROW_WIDTH` 与 CSS 里的 `.smn-panel--narrow { width: 120px }`
是一对镜像，注释里互相点名，改一处必须改另一处。

**持久化跟位置同策略、而非跟高度。** 高度是按会话隔离的（每个会话记自己的大小，
见 §2.8）；窄 / 宽是一个纯粹的视觉偏好，用户不会希望"切个会话面板又变宽了"，
所以用页面级全局单键 `dsh-smn.panel-narrow.v1`，与位置一致。回填时机放在
`Trigger` 的 mount-once effect 里，与 `open` 的自动判定同一次 `commit` —— 晚于
模块初始化（避开 TDZ），又早于 `Panel` 首帧，因此刷新后不会先闪一下宽面板。

**窄栏里被牺牲的东西是显式选择，不是溢出兜底。** 120px 放不下的元素逐个决定去向，
而不是靠 `overflow: hidden` 截断：标题文字与「← 上一层」按钮直接不渲染；状态柱状图
需要横向空间，撤掉后由底栏 `运行/完成/异常` 三个彩色数字承接同样的信息（原文案进
`title`）；「打开对话」按钮塞不进卡片，于是**整张卡片变成 `<button>`** —— 这是可
达性上的必要选择，若只给 `<div>` 加 `onClick`，键盘和读屏用户就失去了打开子代理
的唯一入口，因此补了 `focus-visible` 轮廓、`title` 里回填被省略的
provider / 模式 / 短 id。三枚环里只保留**上下文 + 主会话**两枚，且**保持原大小
48px 不缩小** —— 子代理环被去掉，因为窄栏高度宝贵：再竖排三枚环会让面板拉得很
高，且子代理的聚合信息底栏彩色计数已经能表达；去掉环而不是缩小直径，是不想让环的
可读性（中心百分比、段弧占比）在 120px 里进一步打折。

---

## 3. 架构

### 3.1 双半身结构

```
┌──────────────────────────── DSH Web 进程 ────────────────────────────┐
│                                                                      │
│  Node 半身（Host）                      Browser 半身（Client）          │
│  src/index.ts                           src/client/index.ts          │
│  ┌────────────────────────┐            ┌──────────────────────────┐  │
│  │ inject:                │            │ Slot 注册：               │  │
│  │  sessions, subagents,  │            │  sidebar.footer.action   │  │
│  │  webServer             │            │  shell.overlay           │  │
│  │                        │            │                          │  │
│  │ ctx.on('subagent/*')   │            │ 模块级 store              │  │
│  │   { global: true }     │            │ (useSyncExternalStore)   │  │
│  │        ↓               │            │        ↑                 │  │
│  │ 事件仓库 (runId 分区)   │            │  1s 轮询                  │  │
│  │        ↓               │            │        │                 │  │
│  │ enrich(): 合并持久目录  │            │  fetch('/api/…/snapshot')│  │
│  │        ↓               │   JSON     │        ↓                 │  │
│  │ GET /api/subagent-     │◄───────────┤ 渲染 Trigger + Panel     │  │
│  │   monitor/snapshot     │  (lossless)│ (panel.tsx)              │  │
│  └────────────────────────┘            └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流（一条子代理的一生）

1. 某个会话里的 Agent 派生子代理 → 触发 `subagent/start`；
2. Node 半身（全局监听）收到事件，读取子会话 `parentSession`，归因到直接父会话；
3. 写入事件仓库（按 runId 分区，`startedAt` 记录起始时间）；
4. 子代理结束 → `subagent/end` 到达，仓库中该 runId 标记终态与耗时；
5. 浏览器半身每秒轮询 `/api/subagent-monitor/snapshot?sessionId=<当前会话>`；
6. Node 半身 `enrich()`：当前会话的直接子代理事件（实时）⊕
   `subagents.listChildren`（label/mode + 重启回填）→ 最新优先 → 截断 200 行 →
   对每个子代理折叠会话日志中的 TokenUsage（活会话内存 / 冷会话持久化一次并缓存）
   → 条件展开省略 `undefined` 字段后序列化返回；
7. 面板以 `useSyncExternalStore` 订阅模块级 store，重渲染卡片列表；
8. 用户点击「打开对话」→ 经 `useSessions` 拿到会话快照，路由跳转；
   面板随后显示「← 上一层」返回按钮（跳回直接父会话）。

### 3.3 目录结构

```
dsh-subagent-monitor/
├── src/
│   ├── index.ts            # Node 半身：事件仓库 + enrich + HTTP 路由
│   └── client/
│       ├── index.ts        # Browser 半身入口：Slot 注册 + store + 轮询
│       └── panel.tsx       # Trigger（侧栏按钮）+ Panel（卡片面板）
├── cordis.patch.yml        # dsh.bundle：组合插入清单
├── package.json            # dsh.client + dsh.bundle + prepare 脚本
├── tsconfig.json
├── tsdown.config.ts        # 自包含构建：内联平台模块与模块加载器
├── lib/                    # 预构建产物（index.js / client.js）
├── README.md               # 对外契约（中文）
├── README.en.md            # 对外契约（英文，与中文版配对同步）
├── CHANGELOG.md            # 变更史（与 package.json 版本对齐）
├── AGENTS.md               # 仓库常驻规则（agent / 协作者）
├── ARCHITECTURE.md         # 本文档
├── scripts/verify-docs.mjs # 文档门禁（版本 / 双语 / 链接）
├── .github/                # PR 模板 + verify-docs CI
└── LICENSE                 # MIT
```

### 3.4 关键实现细节

- **事件仓库**：`Map<runId, row>`，`MAX_PER_PARENT = 200`；按直接父会话分区，
  插入时超出则淘汰最旧行。行对象只含标量字段，`undefined` 字段用条件展开
  省略，跨 Host/Client 的 RPC 与快照都保持**无损 JSON**。
- **状态机**：`running → completed / aborted / error / max-tokens / refusal`
  （`stopReason` 直通），另有回填专用的 `unknown`（结局未观测，面板显示
  「已结束」）。
- **直接父会话判定**：事件到达时用 `ctx.sessions.get(id)` 取头部，读
  `header.parentSession` 一跳即得委托方（不再上溯到根）；面板当前会话 ID
  由浏览器侧 `useSessions(s => s.current)` 提供（SnapshotSelectorHook 必须
  传选择器）。
- **构建**：`tsdown` 产出 `lib/index.js` 与 `lib/client.js`；配置文件内联
  平台模块与 `__ModuleLoader__` banner，使仓库**自包含**——不依赖主仓预设，
  `git clone` 后即可 `pnpm install && pnpm build`。
- **用量折叠**：每个子代理一行 `usage`（input / output / cacheRead /
  cacheWrite / contextTokens，可选 contextWindow / pressureTokens /
  projectedTokens）。折叠器复刻 token-meter 投影：`assistant/message`（及
  `assistant/chunk` 的 usage chunk）携带 provider TokenUsage，同 step 用
  「替换旧样本」避免重复计数；`request/context` 记录 contextWindow，最新用量
  样本给出 prompt 侧压力；表层折叠（append 计价每条消息、compaction 按
  shadow price 收缩）把样本向前推到 `projectedTokens`（窗口利用率 =
  projectedTokens / contextWindow，见 §2.13）。活会话走
  `ctx.sessions.get(id).events` 增量折叠，冷会话经 `sessionPersistence.inspect`
  读取一次并缓存（事件水位 watermark），首次加载并行度 8，之后每轮轮询 O(1)。
  总量 / 缓存命中率 / 窗口峰值在 Browser 半身按可见行计算。
- **Hook 顺序约束**：`Panel` 组件的所有 hooks（含 `useRef` / `useEffect`）
  必须位于 `!open` 提前 return **之前**——否则面板打开时 hooks 数量与上次
  渲染不一致，React 抛 #310 并击穿 `shell.overlay` slot（v0.2 开发期踩过，
  已修复并在此记录）。
- **分发**：`dsh plugin add <git/npm>` 安装；`prepare` 脚本保证 git 安装
  路径也有构建产物。

---

## 4. 已知限制（诚实清单）

| 限制 | 说明 |
| --- | --- |
| 轮询路由无鉴权 | 面向回环开发工具定位；路由只读快照，README 已声明 |
| 回填行结局未观测 | 「已结束」不代表成功/失败；见路线图 5.1 |
| 主仓 ↔ GitHub 仓库需手工同步 | 本仓库是发布副本；monorepo 内 `packages/client/ui-subagent-monitor` 是开发源 |
| 事件仓库为内存态 | 重启后仅剩持久目录回填的历史行；进行中 run 的秒表会按子代理会话续算 |
| 用量依赖适配器上报 | provider 不上报 usage 时，看板与卡片该处显示「—」；缓存字段也因 provider 而异（如 deepseek 不报 cacheWriteTokens） |
| 冷会话首次折叠开销 | 首次查看某父会话时需逐个读取冷子代理的持久化日志（之后缓存，每轮轮询 O(1)） |

---

## 5. 路线图 / 剩余工作

### 5.1 功能增强（按价值排序）

1. **「已结束」升级**：回填行异步读取子代理会话日志，还原真实终态
   （成功 / 失败 / 打断）；
2. **打断按钮**：卡片上加「打断」，调用 `subagents.interrupt`；
3. **错误详情展开**：失败行可展开查看错误摘要；
4. **UI 国际化**：面板文案英文字典 + 语言切换（README 已双语，UI 仍为中文硬编码）。

### 5.2 工程化

- ✅ npm 发布 `@leetoners/dsh-ui-subagent-monitor`：最新 v0.3.0 已上线（2026-08-24；
  首发 v0.1.0 于 2026-08-15，GitHub Actions tag 触发 + SLSA provenance），
  `dsh plugin add @leetoners/dsh-ui-subagent-monitor` 一行安装；
- GitHub Actions CI（typecheck + build 自动验证 PR）。

### 5.3 生态收录

- GitHub topic `dsh-plugin`（已设置，Oh-My-DSH 每 4 小时同步）；
- ✅ awesome-dsh-plugin 已收录（commit `c7ad36e9`，PR #675 已合并）；
- ⏳ Oh-My-DSH 目录 PR #8 待维护者合并。

---

## 6. 视觉与主题

面板对齐 DSH 自身设计语言：

- 弹层圆角 12px、阴影 `--dsw-shadow-lv3`、字体 `--dsw-font-family`；
- 运行状态点复刻侧栏 tab 的 `StateDot`：蓝色像素追逐动画
  （`--dsw-static-deepseek-450`，外圈 8 格阶梯点亮），终态为实心点 +
  10% 同色光晕（成功/警告/错误走 `--dsw-alias-state-*` token）；
- 标题左侧（四角箭头图标）/ 底部拖动柄（短横条）用低对比度配色，悬停时
  加深，与卡片区视觉分离；
- 卡片背景与边框取自主题 token，自动适配浅色 / 深色主题；面板仅展示当前层直接子代理，卡片外框等宽对齐。

---

## 7. 参考资料

- [DSH 宿主侧子代理 API 调研](./docs/host-subagent-api.md) —— 对 `ctx.subagents`、
  `ctx.webServer`、会话持久化等宿主能力的只读审计，是 §2.2、§2.11、§2.12 决策的依据。
