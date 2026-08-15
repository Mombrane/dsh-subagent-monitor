# AGENTS.md

本仓库是 `@leetoners/dsh-ui-subagent-monitor`（DeepSeek Harness Web 扩展插件）的**发布副本**；DSH monorepo 内的 `packages/client/ui-subagent-monitor` 是开发源，两者需手工同步（见 ARCHITECTURE.md §4）。

## 仓库布局

- `src/` — 源码：`index.ts`（Node 半身）+ `client/`（Browser 半身）
- `lib/` — 预构建产物（随仓库分发，**勿手改**，由 `pnpm build` 生成）
- `README.md` / `README.en.md` — 对外契约（中文 / 英文，**必须成对同步**）
- `ARCHITECTURE.md` — 设计决策与数据流（决策记录）
- `CHANGELOG.md` — 变更史（与 `package.json` 版本号一致）
- `cordis.patch.yml` — dsh.bundle 组合插入清单
- `scripts/verify-docs.mjs` — 文档门禁脚本（版本 / 双语 / 链接）

## 命令

```sh
pnpm build       # tsdown 构建 lib/
pnpm typecheck   # tsc --noEmit
pnpm verify:docs # 文档门禁（本地跑一遍再提交）
```

## 文档规则

1. **非平凡变更必须在同一 PR 同步文档**：行为 / 接口 / 依赖变化 → 更新 README 特性表与 CHANGELOG；架构级决策 → 更新 ARCHITECTURE.md。只有纯机械 / 局部编辑可豁免。
2. **双语配对**：`README.md`（中文）与 `README.en.md`（英文）必须同 PR 同步修改，内容保持等价；只改一边会被 CI 拒绝。
3. **版本号三处一致**：`package.json` 的 `version`、CHANGELOG 最新条目、git tag（发布时）。README 不单独维护更新记录，只链接 CHANGELOG。
4. **决策状态**：ARCHITECTURE.md 中的决策被取代时**保留原文**，在小节标题后标注 `（已被 §x.x 取代，YYYY-MM-DD）`，新决策写入对应小节；不删除、不改写旧决策。
5. **发布流程**：`pnpm verify:docs` + `pnpm typecheck` + `pnpm build` 全过 → 把 CHANGELOG 的 `[Unreleased]` 条目并入新版本号 → 提交并打 tag → `gh release create` 关联 CHANGELOG 内容。

## 门禁

`.github/workflows/verify-docs.yml` 在 PR 与 master 推送时运行 `scripts/verify-docs.mjs`：
CHANGELOG 版本与 `package.json` 一致、README 双语配对、相对链接有效性。
