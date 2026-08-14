# dsh-subagent-monitor

一个 **DeepSeek Harness (DSH)** Web 界面扩展插件：在侧栏底部提供「子代理」入口按钮，并在屏幕右上角常驻一个**运行中的子代理**实时监视面板。

> 面板截图位（发布后补充截图）

## 功能

- **实时监视**：当前会话派生的每个子代理，以独立圆角卡片展示——运行中（🔵 脉动 + 秒表）、完成（🟢 + 耗时）、失败（🔴）、已打断（🟠）、令牌上限、已拒绝
- **卡片化列表**：每个子代理一张卡片；任务名在标题行，「打开对话」按钮在右侧，状态与耗时在卡片第二行
- **树形缩进**：子代理的子代理（孙代）卡片向右缩进
- **打开对话**：一键跳转到该子代理的会话；进入子代理会话后，面板标题栏出现「← 主会话」返回按钮
- **页面刷新自动恢复**：面板是常驻组合的一部分，刷新/重启后自动回来（不同于临时动态插件）
- **移动端默认隐藏**：视口 ≤ 768px 时默认不弹出面板，侧栏按钮仍可手动打开
- **历史回填**：服务重启后，之前创建的子代理（🟢/⚪）从持久目录回填显示

## 环境要求

- DeepSeek Harness `0.1.x`（源码仓库或安装版均可）
- Node.js 22+

## 安装方式 A：DSH 源码仓库（推荐，完整流程已验证）

1. 将本仓库的 `src/` 复制为 `<dsh>/packages/client/ui-subagent-monitor/`，并使用该目录下的
   `package.json`、`tsconfig.json`、`tsdown.config.ts`
2. 在 `<dsh>/packages/bundle/web-app/package.json` 的 dependencies 中加入：
   ```json
   "@mombrane/dsh-ui-subagent-monitor": "workspace:*"
   ```
3. 在 `<dsh>/packages/bundle/web-app/cordis.patch.yml` 的浏览器插件清单（`ui-subagent` 行之后）加入：
   ```yaml
   - id: ui-subagent-monitor
     name: '@mombrane/dsh-ui-subagent-monitor'
   ```
4. 在 `<dsh>/tsconfig.client.json` 的 `references` 中加入：
   ```json
   { "path": "./packages/client/ui-subagent-monitor" }
   ```
5. 把包的 `tsdown.config.ts` 改为引用主仓预设（与兄弟包一致）：
   ```ts
   import { clientBundle } from '../tsdown.client.ts'
   export default clientBundle('@mombrane/dsh-ui-subagent-monitor', ['lib/types/index.js'])
   ```
6. 执行：
   ```bash
   pnpm install
   pnpm --filter @mombrane/dsh-ui-subagent-monitor bundle
   ```
7. 重启 `dsh web`，打开页面即可看到右上角面板。

## 安装方式 B：npm 依赖 + patch 覆盖（安装版部署）

本仓库随附预构建产物（`lib/index.js` 与 `lib/client.js`），可直接作为依赖安装：

```bash
npm install @mombrane/dsh-ui-subagent-monitor
```

然后在部署的 patch 覆盖层中加入组合行：

```yaml
- id: ui-subagent-monitor
  name: '@mombrane/dsh-ui-subagent-monitor'
```

重启 `dsh web`。注意：模块扫描以 web 组合的依赖图为准，若部署结构与此不符，
请回退到方式 A。

## 本仓库构建

```bash
npm install        # 需要能解析 @deepseek-ai/* 平台包（DSH 仓库的 node_modules 即可）
npm run typecheck
npm run build      # 产出 lib/index.js（Node 半身）与 lib/client.js（浏览器 bundle）
```

## FAQ

**刷新页面后面板会消失吗？**
不会。面板是组合中的常驻行，页面每次加载都会重新挂载；数据由 Node 半身的路由提供。

**「已结束」和「完成」有什么区别？**
🟢 完成：面板实时观测到该子代理成功结束；⚪ 已结束：该子代理是服务重启前创建的历史记录，面板未观测到结局（成功与否未知）。

**面板数据从哪来？**
Node 半身监听 `subagent/start` / `subagent/end` 事件（按父会话链归因到当前会话），
并与 `subagents.listDescendants` 的持久目录合并。每会话最多保留 200 条记录。

**安全说明**
面板轮询的 `/api/subagent-monitor/snapshot` 路由是面向回环地址的开发工具接口，
不做鉴权；仅建议在本地/内网部署使用。

## License

[MIT](./LICENSE)
