# 04 — 呈现完成后的 edit 统一 diff

**What to build:** Pi 用户完成 `edit` 后，在工具历史中获得主题一致、宽度安全的统一 diff；长 diff 默认折叠但可展开，失败信息仍可直接诊断。呈现只发生在工具完成后，不引入流式 pending preview 或其他 diff 形态。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** resolved

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [x] 成功 `edit` 完成后显示统一 diff，使用当前主题的新增、删除和上下文呈现
- [x] `diffCollapsedLines` 默认值为 24，可通过 JSON 配置调整；缺失、损坏或非法字段安全回退
- [x] 长 diff 在折叠状态保留明确的展开信息，展开后可审阅完整可用 diff
- [x] diff 在窄终端宽度内保持可渲染；失败结果显示诊断而非成功 diff 外观
- [x] 不提供 split diff、词级高亮或执行期间的 preview
- [x] 自动化测试覆盖成功、折叠/展开、配置、窄宽度和失败路径，且 `bun run verify` 通过

## Answer

- `my-tool-display` 现在仅在 `edit` 仍由 Pi 内置实现拥有时注册覆盖；执行继续委托 Pi 原生 definition，并使用实际 `ctx.cwd`，原生 schema、metadata 和参数适配保留。
- edit 调用头只显示目标路径；完成后使用当前主题的新增、删除和上下文颜色呈现 Pi 返回的 display diff。长 diff 默认按 `diffCollapsedLines`（默认 24）折叠，展开显示完整返回 diff。
- 覆盖将 `renderShell` 切回 Pi 标准 shell，因此成功/失败状态由 Pi 原生 TUI 提供；没有参数生成期间的 diff preview、split diff 或词级高亮。
- 失败结果优先显示错误文本，不渲染成功 diff；缺少 diff 数据时显示安全摘要。`Text` 组件负责窄宽度换行。
- 验证：`bun run verify`（923 tests）通过；`bun run --cwd ly-pi build` 与 typecheck 通过；未执行部署或 `/reload`。
