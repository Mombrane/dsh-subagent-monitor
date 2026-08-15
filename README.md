<h1 align="center">🤖 dsh-subagent-monitor</h1>

<p align="center">
  DeepSeek Harness (DSH) Web 扩展插件 · 子代理实时运行监视面板
  <br/>
  <a href="https://github.com/Mombrane/dsh-subagent-monitor/blob/master/LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-Web-8b5cf6">
  <img alt="dsh" src="https://img.shields.io/badge/DSH-0.1.x-2563eb">
</p>

---

## ✨ 是什么

在 DSH Web 界面侧栏底部加一个「子代理」入口，并在屏幕**右上角**常驻一块卡片式面板，实时展示当前会话派生的每一个子代理的运行状态。

```
┌─ 运行中的子代理 ──────────── [收起 ▴] [✕] ┐
│ ┌─────────────────────────────────────┐ │
│ │ 🔵 统计 ui 目录 TS 文件数   [打开对话] │ │
│ │    one-shot · 1a2b3c4d   运行中 · 00:42 │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🟢 演示子代理：统计文件类型  [打开对话] │ │
│ │    spawn · 2b3c4d5e    完成 · 03:12  │ │
│ └─────────────────────────────────────┘ │
│  运行 1 · 完成 1 · 异常 0    [清空已完成] │
└─────────────────────────────────────────┘
```

<!-- 截图占位：运行中的面板实际截图 -->

## 🎯 特性

| 特性 | 说明 |
| --- | --- |
| 🟢 实时状态 | 运行中（🔵 蓝色呼吸 + 秒表）、完成、失败、已打断、令牌上限、已拒绝 |
| 🃏 卡片化列表 | 每个子代理一张圆角卡片；「打开对话」在右侧，状态与耗时在第二行 |
| 🌲 树形缩进 | 孙代子代理卡片向右缩进 |
| 🔙 一键返回 | 进入子代理会话后，面板出现「← 主会话」按钮 |
| 🔄 刷新自恢复 | 常驻组合，页面刷新 / 服务重启后自动恢复 |
| 📱 移动端友好 | ≤768px 视口默认不弹出，侧栏按钮仍可手动打开 |

## 📦 安装

### 方式 A · 官方 CLI（推荐，一行命令）

```bash
dsh plugin --profile <你的profile> add @mombrane/dsh-ui-subagent-monitor
# 或从 GitHub 直装（需按提示在 profile 的 pnpm-workspace.yaml 中允许构建）
dsh plugin --profile <你的profile> add github:Mombrane/dsh-subagent-monitor
```

重启 `dsh web` 即生效。本仓库同时是 **DSH 客户端插件**（`dsh.client`）与 **组合 bundle**（`dsh.bundle` + `cordis.patch.yml`），并随附预构建 `lib/`。

### 方式 B · DSH 源码仓库内联（适合二次开发）

```bash
# 1. 复制本仓库 src/ 为 <dsh>/packages/client/ui-subagent-monitor/
# 2. <dsh>/packages/bundle/web-app/package.json 加依赖
"@mombrane/dsh-ui-subagent-monitor": "workspace:*"
```

```yaml
# 3. <dsh>/packages/bundle/web-app/cordis.patch.yml（ui-subagent 行之后）
- id: ui-subagent-monitor
  name: '@mombrane/dsh-ui-subagent-monitor'
```

```bash
# 4. 构建 + 重启
pnpm install && pnpm --filter @mombrane/dsh-ui-subagent-monitor bundle
# 重启 dsh web
```

> 还需在 `<dsh>/tsconfig.client.json` 的 `references` 中加入本包路径，并将本包
> `tsdown.config.ts` 改为引用主仓预设（`import { clientBundle } from '../tsdown.client.ts'`）。

## 🏷️ 状态图例

| 状态 | 含义 |
| --- | --- |
| 🔵 运行中 | 正在执行，蓝色呼吸 + 实时秒表 |
| 🟢 完成 | 面板实时见证其成功结束，显示耗时 |
| ⚪ 已结束 | 历史回填行：服务重启前创建，结局未观测（成功/失败未知） |
| 🔴 失败 / 🟠 已打断 | 错误结束 / 被中止 |

## ❓ FAQ

**刷新页面会消失吗？** 不会。面板是组合中的常驻行，页面每次加载自动恢复。

**「完成」和「已结束」有什么区别？** 🟢 是面板实时观测到的成功结局；⚪ 是服务重启前的历史记录，结局未观测。

**面板有多大的容量？** 每会话最多保留 200 条，超出淘汰最旧的已结束行。

**安全吗？** 轮询路由 `/api/subagent-monitor/snapshot` 面向回环地址、无鉴权，仅建议本地/内网使用。

## 📄 License

[MIT](./LICENSE) © Mombrane
