# 06 — 切换并移除第三方显示配置

**What to build:** 在七个原生工具的自有呈现均可用并已验证后，ly-pi 用户只通过自有模块获得工具显示；仓库不再部署或说明旧第三方配置，并提供可审计的人工卸载指引，而不自动修改用户级 npm 安装。

**Blocked by:** 02 — 覆盖搜索与目录工具呈现; 03 — 提供紧凑 bash 结果; 05 — 呈现安全的 write 统一 diff

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [ ] 七个约定的 Pi 原生工具均由已完成 tickets 提供所需的紧凑呈现，范围外工具保持未改变
- [ ] 仓库停止部署旧第三方工具显示配置，并移除仅服务于该配置的文档说明
- [ ] 文档说明在验证自有模块后由用户手动执行 `pi uninstall npm:pi-tool-display`；部署流程不得自动卸载用户级包
- [ ] 完成完整自动化验证、正常部署和 `/reload`，并在交互式 TUI 手动确认成功折叠、展开、错误可见、diff 与安全摘要
- [ ] `bun run verify` 通过，且迁移不会引入旧 renderer 与自有 renderer 的双轨运行
