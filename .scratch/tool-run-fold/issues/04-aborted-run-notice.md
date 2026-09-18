# 04 — 中断与报错终止的收起与提示

**What to build:** 被中断（Esc）或因供应商错误而终止的 Tool Run 不会在屏幕上留下几十行现场。它与正常结束一样收起，并在最后一条 Tool Row 位置显示与 Run Failure Notice 同族的提示（`⚠ aborted at bash: bun test` / `⚠ error`），用户仍可展开回看细节。

**Blocked by:** 02 — 完成即收：一次 Tool Run 只留一行摘要

**Status:** ready-for-agent

**Risk:** Medium

**Approval:** 范围与验收标准由用户在设计会话（2026-09-18）确认，记录于 `.scratch/tool-run-fold/spec.md`。

- [ ] 中断（aborted）与报错终止的 Tool Run 正常收起
- [ ] 终止提示显示在最后一条 Tool Row 位置，并区分中断与报错两种文案
- [ ] 终止后的 Tool Run 仍可通过 `ctrl+o` 展开回看
- [ ] 重试（retry）场景不产生重复摘要行或重复提示
- [ ] 折叠核心单测覆盖中断与报错两条终止路径；渲染契约测试覆盖两种文案
- [ ] `bun run verify` 通过；真实 TUI 手动确认 Esc 中断一次长任务后的版面
