# 06 — 切换并移除第三方显示配置

**What to build:** 在七个原生工具的自有呈现均可用并已验证后，ly-pi 用户只通过自有模块获得工具显示；仓库不再部署或说明旧第三方配置，并提供可审计的人工卸载指引，而不自动修改用户级 npm 安装。

**Blocked by:** 02 — 覆盖搜索与目录工具呈现; 03 — 提供紧凑 bash 结果; 05 — 呈现安全的 write 统一 diff

**Status:** claimed

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] 七个约定的 Pi 原生工具均由已完成 tickets 提供所需的紧凑呈现，范围外工具保持未改变
- [x] 仓库停止部署旧第三方工具显示配置，并移除仅服务于该配置的文档说明
- [x] 文档说明在验证自有模块后由用户手动执行 `pi uninstall npm:pi-tool-display`；部署流程不得自动卸载用户级包
- [ ] 完成完整自动化验证、正常部署和 `/reload`，并在交互式 TUI 手动确认成功折叠、展开、错误可见、diff 与安全摘要
- [x] `bun run verify` 通过，且迁移不会引入旧 renderer 与自有 renderer 的双轨运行

## Answer

- 删除旧的 `ly-pi/assets/config/pi-tool-display.json`，并从 `ly-pi/scripts/deploy.ts` 移除第三方配置复制项；部署时还会清理由本仓库管理的既有 `extensions/pi-tool-display/config.json`，但不会卸载用户级 npm 包。
- README 不再说明旧配置文件，新增迁移指引：完成自有模块验证后由用户手动执行 `pi uninstall npm:pi-tool-display`。
- `my-tool-display` 继续由统一入口注册七个原生工具的呈现覆盖；源码静态审计确认没有旧配置或旧 renderer 的双轨引用。
- 验证：`bun run verify`、`bun run --cwd ly-pi build` 和 `git diff --check` 通过。
- 按当前会话约束未执行正常部署、`/reload`、TUI 手动确认或用户级卸载；这些是交付前由用户执行的最后迁移步骤。
