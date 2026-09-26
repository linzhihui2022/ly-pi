# 03 — 展示护栏：二进制与超长输出占位

**What to build:** 选中二进制文件（或二进制 diff）时，视图显示提示文案（如 "Binary file, not shown"）而非乱码。diff 或全文的输出超过 500 行时，同样只显示提示文案而不渲染内容，避免 TUI 被超长输出拖垮。

**Blocked by:** 01 — 打通主干：/diff 选择器 + 已跟踪文件 diff 直通

**Status:** resolved

- [x] 二进制文件/diff 选中后显示占位提示文案
- [x] 输出超 500 行（diff 与 untracked 全文同标准）显示占位提示文案
- [x] 恰好 500 行正常展示，501 行触发占位（边界清晰）
- [x] 二进制检测与行数阈值分支有单元测试，覆盖率达标
- [x] `bun run check-docs` 通过

## Comments

实现备忘（2026-08）：

- 护栏收敛在 `buildDiffView`（view.ts）：先判二进制（NUL 字节或 git 的 `Binary files ... differ` 标记）→ "Binary file, not shown"；再判行数 > 500 → "Output too large (N lines, limit 500), not shown"
- 占位文案作为 DiffView.lines 的单行输出，随主题 context 色渲染，视图组件零改动
- 500/501 边界、NUL 内容、git 二进制 diff 三类分支均有 fixture 测试
- 已 `bun run deploy`；`/reload` 后可验证。至此 spec 全部三票完成

Review 修复：二进制检测从 `startsWith` 改为多行匹配 `/^Binary files /m`——真实 `git diff HEAD` 输出以 `diff --git` 头开头，原实现永不触发且测试 fixture 省略了 diff 头造成虚假绿色；fixture 已改为真实输出形态。另补空内容占位：tracked 空 diff → `(no diff output)`，untracked 空文件 → `(empty file)`。
