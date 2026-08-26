# 01 — 建立自有 read 紧凑呈现

**What to build:** Pi 用户获得由 ly-pi 自己维护的 `read` 工具紧凑呈现：成功读取时不显示冗长正文，展开后仍可查看 Pi 原生完整结果，失败时直接显示诊断。该完整路径同时建立安全的原生工具 renderer 所有权、reload 生命周期和最小启用配置，让用户可以关闭自定义呈现并回到 Pi 默认行为。

**Blocked by:** None — can start immediately

**Status:** resolved

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] `read` 成功结果在折叠状态隐藏正文，展开状态显示 Pi 实际返回的原始结果
- [x] `read` 失败始终显示错误状态及可用诊断文本，不受成功隐藏规则影响
- [x] `enabled` 默认开启；缺失、损坏或无效配置安全回退；显式关闭时保留 Pi 默认呈现
- [x] 仅在 Pi 内置 `read` renderer 仍拥有工具时注册覆盖；重复初始化或 `/reload` 不会留下多个自身 renderer
- [x] 非 TUI 运行安全降级，且覆盖保留原生工具的执行和提示语义
- [x] 新模块与其启用配置同步列入 README，满足仓库文档一致性检查
- [x] 自动化测试覆盖上述用户可见行为，且 `bun run verify` 通过

## Answer

- 新增自有 `my-tool-display`，仅接管仍由 Pi 内置实现拥有的 `read`；成功文本折叠隐藏、展开显示完整结果，失败（包括 partial error）始终显示诊断，图片结果展开时委托 Pi 原生 renderer。
- 原生执行、参数兼容与 prompt 元数据继续来自 Pi 的 read definition；无效配置回退、显式禁用、外部所有权、重复初始化与工具发现不可用均有回归测试。
- README 同步模块和配置说明是仓库 extension-table 检查的必要条件；第三方配置迁移仍留给 06。
- 审查发现并修复了 partial error 被 “Reading...” 覆盖的问题。关于 reload 的担忧已按 Pi 0.84.2 运行时源码核实：reload 会失效旧 runner、清除扩展缓存并重新构建原生工具表，因此本模块无需也无法额外 unregister renderer。
- 验证：`bun run --cwd ly-pi build`、`bun run verify`（886 tests）均通过。
- 未执行部署或 `/reload`：部署被项目护栏视为高风险，需单独批准。
