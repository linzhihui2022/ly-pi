# 04 — 呈现完成后的 edit 统一 diff

**What to build:** Pi 用户完成 `edit` 后，在工具历史中获得主题一致、宽度安全的统一 diff；长 diff 默认折叠但可展开，失败信息仍可直接诊断。呈现只发生在工具完成后，不引入流式 pending preview 或其他 diff 形态。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** User approved the scope, specification, and ticket plan in the associated Pi conversation.

- [ ] 成功 `edit` 完成后显示统一 diff，使用当前主题的新增、删除和上下文呈现
- [ ] `diffCollapsedLines` 默认值为 24，可通过 JSON 配置调整；缺失、损坏或非法字段安全回退
- [ ] 长 diff 在折叠状态保留明确的展开信息，展开后可审阅完整可用 diff
- [ ] diff 在窄终端宽度内保持可渲染；失败结果显示诊断而非成功 diff 外观
- [ ] 不提供 split diff、词级高亮或执行期间的 preview
- [ ] 自动化测试覆盖成功、折叠/展开、配置、窄宽度和失败路径，且 `bun run verify` 通过
