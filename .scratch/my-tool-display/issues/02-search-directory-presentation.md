# 02 — 覆盖搜索与目录工具呈现

**What to build:** Pi 用户获得与 read 一致的紧凑 `grep`、`find` 和 `ls` 呈现：成功结果默认不占据会话，展开后可审阅 Pi 原生输出，错误始终可诊断；其他工具类型保持未受影响。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** resolved

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] `grep`、`find` 与 `ls` 的成功结果默认隐藏正文，调用标题保持紧凑且可识别
- [x] 展开每一种工具后显示 Pi 实际返回的完整原始结果，不虚构已被 Pi 截断的内容
- [x] 三种工具的失败状态显示错误和可用诊断文本
- [x] MCP、第三方扩展及自定义工具不被本 ticket 的呈现逻辑注册、拦截或改变
- [x] 自动化测试覆盖三种工具的成功、展开与失败路径，且 `bun run verify` 通过

## Answer

- `my-tool-display` 现在仅在目标仍由 Pi 内置工具拥有时覆盖 `grep`、`find` 与 `ls`；执行继续通过当前 `ctx.cwd` 创建的原生 definition 委托。
- 成功结果默认隐藏，展开后显示 Pi 返回的原始文本；失败结果即使折叠也保留可用诊断。原生 call renderer、参数 schema、prompt metadata 和 result details 均保留。
- README 已同步当前覆盖范围。
- 验证：`bun run verify`（本 ticket 完成时的测试快照为 899 tests）通过；未执行部署或 `/reload`。
