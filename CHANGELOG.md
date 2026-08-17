# Changelog

本文件记录 `@leetoners/dsh-ui-subagent-monitor` 所有值得记录的变更。
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-08-17

### Added

- 面板拖动：左侧新增竖向拖动柄（抓手点列），按住可自由移动面板；位置写入 localStorage，刷新 / 重启浏览器后恢复；双击复位到默认右上角。
- 面板高度调节：底部新增横向拖动柄（统计栏与底边之间），上下拖动改变面板高度（最小 160px）；高度写入 localStorage，双击复位。
- 运行状态点改为圆角方块：与 DSH 会话框「思考中」指示器（TurnStatus）同款的 deepseek 蓝渐变扫光（500 → 200 → 500，1.8s linear），替代原圆形呼吸动画；遵循 `prefers-reduced-motion`。

### Changed

- 面板结构改为「左侧拖动柄 + 内容列」横向 flex 布局，内容区新增 `.smn-panel-inner` 容器。

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
