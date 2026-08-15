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
打开固定面板。面板里每个子代理是一张独立卡片：蓝色呼吸圆点 + 秒表（运行中）、
绿色对勾 + 耗时（完成）、红色叉（失败）、橙色状态（打断 / 令牌上限 / 拒绝），
以及中性的「已结束」（历史回填、结局未观测）。最新派生的在最上面，孙代
子代理向右缩进，卡片上「打开对话」可跳转到该子代理的会话。

### 关键数字

| 项 | 值 |
| --- | --- |
| 面板位置 | 固定，top:80px / right:16px，宽 340px |
| 刷新频率 | 1 秒轮询（粗粒度 start/end 事件下足够“实时”） |
| 历史保留 | 每个根会话最多 200 行，超出按最旧淘汰 |
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

### 2.3 为什么事件要“全局监听 + 父链归因”

`subagent/start` 与 `subagent/end` 事件按**委托方（父会话）的作用域**分发：
谁派生的，事件在谁的组合作用域里可见。而本插件挂在根组合上（不属于任何
会话作用域），用 `{ global: true }` 监听后收到的是**全进程**的事件流。

因此 Node 半身对每个 run 走一遍
`session.header.parentSession` 父链，把事件归因到最顶层（根）会话。
面板只展示“当前会话的森林”，而不是整个进程的噪声。

### 2.4 为什么事件要合并 `subagents.listDescendants`

- 事件载荷里没有 label、mode、depth 等展示字段，持久化目录里有；
- 服务重启后内存事件仓库清空，但子代理记录在持久目录里——合并它
  等价于免费的**历史回填**，刷新 / 重启后面板仍能显示进行中或已结束
  的子代理。

合并结果中新派生优先（`startedAt ?? sortKey` 降序）。

### 2.5 为什么存在「已结束」这个中性状态

历史回填的行没有观测到结局事件，无法判定成功 / 失败。如实标注“已结束”
优于猜测；状态图标为中性灰色圆点，提示“结局未观测”。

### 2.6 为什么取消拖拽

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
2. Node 半身（全局监听）收到事件，沿 `parentSession` 链归因到根会话；
3. 写入事件仓库（按 runId 分区，`startedAt` 记录起始时间）；
4. 子代理结束 → `subagent/end` 到达，仓库中该 runId 标记终态与耗时；
5. 浏览器半身每秒轮询 `/api/subagent-monitor/snapshot?sessionId=<根会话>`；
6. Node 半身 `enrich()`：事件仓库（实时）⊕ `subagents.listDescendants`
   （label/mode/depth + 重启回填）→ 最新优先 → 截断 200 行 → `clean()`
   剥离 `undefined` 后序列化返回；
7. 面板以 `useSyncExternalStore` 订阅模块级 store，重渲染卡片列表；
8. 用户点击「打开对话」→ 经 `useSessions` 拿到会话快照，路由跳转；
   面板随后显示「← 主会话」返回按钮。

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

- **事件仓库**：`Map<runId, row>`，`MAX_PER_ROOT = 200`；插入时超出则淘汰
  最旧行。行对象在序列化前经 `clean()` 递归剥离 `undefined` 属性——跨
  Host/Client 的 RPC 与快照都必须是**无损 JSON**。
- **状态机**：`running → done / failed / interrupted / token-limited /
  rejected`，另有回填专用的 `ended`（结局未观测）。
- **根会话判定**：事件到达时用 `ctx.sessions.get(id)` 取头部，沿
  `header.parentSession` 上溯到无父者；面板当前会话 ID 由浏览器侧
  `useSessions(s => s.current)` 提供（SnapshotSelectorHook 必须传选择器）。
- **构建**：`tsdown` 产出 `lib/index.js` 与 `lib/client.js`；配置文件内联
  平台模块与 `__ModuleLoader__` banner，使仓库**自包含**——不依赖主仓预设，
  `git clone` 后即可 `pnpm install && pnpm build`。
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

---

## 5. 路线图 / 剩余工作

### 5.1 功能增强（按价值排序）

1. **「已结束」升级**：回填行异步读取子代理会话日志，还原真实终态
   （成功 / 失败 / 打断）；
2. **打断按钮**：卡片上加「打断」，调用 `subagents.interrupt`；
3. **错误详情展开**：失败行可展开查看错误摘要；
4. **i18n**：英文字典 + 英文 README。

### 5.2 工程化

- ✅ npm 发布 `@leetoners/dsh-ui-subagent-monitor`：v0.1.0 已上线（2026-08，
  GitHub Actions tag 触发 + SLSA provenance），
  `dsh plugin add @leetoners/dsh-ui-subagent-monitor` 一行安装；
- GitHub Actions CI（typecheck + build 自动验证 PR）；
- README 截图替换占位。

### 5.3 生态收录

- GitHub topic `dsh-plugin`（已设置，Oh-My-DSH 每 4 小时同步）；
- PR 合并跟踪：Oh-My-DSH `data/curated.json`、awesome-dsh-plugin README。

---

## 6. 视觉与主题

面板对齐 DSH 自身设计语言：

- 弹层圆角 12px、阴影 `--dsw-shadow-lv3`、字体 `--dsw-font-family`；
- 运行圆点使用 deepseek 蓝（`--dsw-static-deepseek-500` → `200`）呼吸动画，
  与对话气泡的“思考中”节奏一致；
- 卡片背景与边框取自主题 token，自动适配浅色 / 深色主题。
