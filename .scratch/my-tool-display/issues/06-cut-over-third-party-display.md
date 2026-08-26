# 06 — 切换并移除第三方显示配置

**What to build:** 在七个原生工具的自有呈现均可用并已验证后，ly-pi 用户只通过自有模块获得工具显示；仓库不再部署启用状态的旧第三方配置，仅在用户手动卸载前保留禁用状态的兼容配置，并提供可审计的人工卸载指引，而不自动修改用户级 npm 安装。

**Blocked by:** 02 — 覆盖搜索与目录工具呈现; 03 — 提供紧凑 bash 结果; 05 — 呈现安全的 write 统一 diff

**Status:** resolved

**Risk:** High

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation. User additionally approved the disabled compatibility-config exception during the A1 review fix, shared output sanitization during the A2 review fix, restoring effective Bash shell settings during the A3 review fix, per-field configuration fallback during the B1 review fix, and the C1 regression test for oversized new writes.

- [x] 七个约定的 Pi 原生工具均由已完成 tickets 提供所需的紧凑呈现，范围外工具保持未改变
- [x] 仓库停止部署启用状态的旧第三方工具显示配置；在手动卸载前仅部署禁用状态的兼容配置
- [x] 文档说明在验证自有模块后由用户手动执行 `pi uninstall npm:pi-tool-display`；部署流程不得自动卸载用户级包
- [x] 完成完整自动化验证、正常部署和 `/reload`，并在交互式 TUI 手动确认成功折叠、展开、错误可见、diff 与安全摘要
- [x] `bun run verify` 通过，且迁移不会引入旧 renderer 与自有 renderer 的双轨运行

## Answer

- 删除旧的启用配置 `ly-pi/assets/config/pi-tool-display.json`；部署会在新扩展前原子写入 `ly-pi/assets/config/pi-tool-display-disabled.json`，将既有 `extensions/pi-tool-display/config.json` 设为 `enabled: false`，但实际禁用效果取决于旧 renderer 是否支持该字段，也不会卸载用户级 npm 包。
- README 新增迁移指引：部署会保留禁用状态的兼容配置；完成自有模块验证后由用户手动执行 `pi uninstall npm:pi-tool-display`。
- `my-tool-display` 继续由统一入口注册七个原生工具的呈现覆盖；源码静态审计确认没有旧配置或旧 renderer 的双轨引用。
- A1 修复在工具发现失败时记录开发日志，并安全降级为不注册自有 renderer。
- A2 修复使所有自有文本 renderer 通过共享净化路径移除 VT/ANSI 序列与危险控制字符。
- A3 修复在按执行 cwd 重建 Bash definition 时，通过公开 `SettingsManager` 恢复有效的 `shellCommandPrefix` 与 `shellPath`，并只在项目受信任时应用项目级设置。
- B1 修复对折叠行数逐字段回退，避免一个非法值将明确的 `enabled: false` 或另一个有效折叠行数改回全局默认值。
- C1 新增超大新内容跳过 diff 预览时仍委托原生 `write` 并写入文件的回归测试。
- 验证：`bun run deploy` 成功（66 个测试文件、1108 个测试通过），随后完成 `/reload`；真实 TUI 人工确认 read/grep/find/ls 的成功折叠与展开、bash 的 10 行折叠与错误可见性、edit/write 的统一 diff，以及工作区外 write 的安全摘要全部通过。用户手动执行 `pi uninstall npm:pi-tool-display` 并再次 `/reload`；复核 `pi list`、用户 settings 与 npm 包目录均确认旧包已移除。最终 `bun run verify` 与 `git diff --check` 通过。
