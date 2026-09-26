# 01 — 显示当前 Git worktree

**What to build:** 当 Pi 会话位于拥有至少两个可见 worktree 的 Git 仓库、且能唯一确定 Current Worktree 时，在编辑器上方显示一个独立的只读两行组件。标题为 accent 的 `● Worktrees (N)`，其中 N 是全部可见 worktree（含当前项）；唯一行以中性的 `└─ •` 显示 Current Worktree 的分支或短 commit SHA 与根路径，不展示其他 worktree 明细。它会在会话和轮次边界更新，且在不适用、无法确定当前项或路径完全无可用宽度时安静隐藏。

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] 当仓库至少有两个可见 worktree 且能唯一确定 Current Worktree 时，在编辑器上方显示两行 Current Worktree 组件；单 worktree、不可查询或无法确定当前项时不显示组件。
- [x] 标题使用 accent 的 `● Worktrees (N)`，N 统计全部可见项；唯一行使用中性的 `└─ •`，显示当前分支或 detached-HEAD 的短 commit SHA 与 worktree 根路径，不渲染其他项。
- [x] 主 worktree 根及其子路径缩写为 `<REPO>`，外部 worktree 保持绝对路径；窄屏从路径开头截断保留末尾，若没有路径宽度则隐藏组件。
- [x] 数据层排除失效、不可访问或 prunable worktree，保留 detached-HEAD 标识，并将最深层包含 session cwd 的 worktree 识别为当前项。
- [x] 会话启动、每轮开始和结束时重新检测；不新增命令、选择器、切换、轮询或配置。
- [x] 数据与 widget seam 覆盖新的单当前项、聚合计数、静默隐藏和宽度行为，且完整 `bun run verify` 通过。

## Answer

Initial implementation was deployed and verified, then reopened after visual validation found that an outer worktree was incorrectly marked current when the actual worktree is nested beneath it.

The resolved implementation renders only the uniquely determined Current Worktree, recomputes it from currently accessible entries, and silently hides malformed or width-ineligible output. `bun run verify` passes.

## Comments

- Reopened to ensure nested worktrees yield exactly one current item and to apply the approved compact, borderless embedded list styling.
- The compact-list result was visually unclear; user confirmed a Todo-style tree with heading, branch connectors, and row-state glyphs.
- Removed the explicit trailing spacer because it creates an unwanted blank line before the separately rendered Todos widget.
- User requested `<REPO>` abbreviation for the primary worktree root and descendants, with external worktrees left absolute.
- Latest confirmed direction supersedes the historical all-row display: retain only the aggregate visible count and render the uniquely resolved Current Worktree as the single neutral row. Nested worktrees select the deepest match; a later refresh reflects an externally removed current worktree when another enclosing worktree becomes current.
