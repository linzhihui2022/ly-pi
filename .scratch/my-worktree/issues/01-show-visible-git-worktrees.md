# 01 — 显示可见 Git worktree

**What to build:** 当 Pi 会话位于拥有至少两个可见 worktree 的 Git 仓库时，在编辑器上方显示一个独立的只读 worktree 列表。列表按 Git 顺序展示每个可访问 worktree 的分支或短 commit SHA 和绝对路径，并明确标记当前 worktree；它会在会话和轮次边界更新，且在不适用时安静隐藏。

**Blocked by:** None — can start immediately.

**Status:** claimed

- [ ] 多 worktree 仓库在编辑器上方显示 Todo 风格的工作树树形列表；单 worktree 或不可查询状态不显示组件。
- [ ] 每项显示分支或 detached-HEAD 的短 commit SHA 与路径；主 worktree 根及其子路径缩写为 `<REPO>`，其他 worktree 保持绝对路径；当前项使用实心符号和主题强调色，其余项使用空心弱化符号。
- [x] 失效或不可访问 worktree 被排除，至少两个可见项才显示，顺序保持与 Git 一致。
- [x] 窄屏渲染安全且从路径开头截断，保留路径末尾。
- [x] 会话启动、每轮开始和结束时重新检测；不新增命令、选择器、切换、轮询或配置。
- [x] 数据与 widget 两条已确认 seam 均有行为测试，且完整 `bun run verify` 通过。

## Answer

Initial implementation was deployed and verified, then reopened after visual validation found that an outer worktree was incorrectly marked current when the actual worktree is nested beneath it.

## Comments

- Reopened to ensure nested worktrees yield exactly one current item and to apply the approved compact, borderless embedded list styling.
- The compact-list result was visually unclear; user confirmed a Todo-style tree with heading, branch connectors, and row-state glyphs.
- Removed the explicit trailing spacer because it creates an unwanted blank line before the separately rendered Todos widget.
- User requested `<REPO>` abbreviation for the primary worktree root and descendants, with external worktrees left absolute.
