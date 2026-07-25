# 03 — 删除旧文档体系与结构碎片

**What to build:** 旧 REQUIREMENTS/SPEC 体系从仓库中消失：根级 REQUIREMENTS.md、SPEC.md 及 5 个扩展各自的 REQUIREMENTS.md、SPEC.md 全部删除（不留归档副本，git 历史即归档）；无源码空壳 pi-preview-server/ 与空目录 docs/superpowers/ 清除；根 package.json workspaces、bun.lock、turbo 配置中无残留引用，`bun install` 与 `bunx turbo run build` 不受影响。完成后 `bun run check-docs` 的"旧体系复活"校验项转绿。

**Blocked by:** 01 — 迁移旧文档中的未实现待办到 .scratch 票据（用户确认迁移清单无遗漏后才能动手）

**Status:** resolved

- [x] 7 份 REQUIREMENTS.md 与 7 份 SPEC.md（根级 + 5 扩展）全部删除
- [x] pi-preview-server/ 与 docs/superpowers/ 已删除，无悬空引用
- [x] `bun install` 与 `bunx turbo run build` 正常通过
- [x] `bun run check-docs` 第 (5) 项校验通过

## Answer

已删除根级 + 5 扩展共 12 份 REQUIREMENTS/SPEC（票据验收中"7 份"为笔误，实际根级 + 5 扩展 = 各 6 份）、pi-extensions/pi-preview-server/ 空壳与 docs/superpowers/ 空目录。workspaces 使用 pi-extensions/* 通配，无显式残留引用；bun.lock 无 pi-preview-server 条目。`bun install`、`bunx turbo run build`（5/5）通过，`bun run check-docs` 的 no-legacy-docs 项转绿。relative-links 报的 2 个 README 链接失效属票 04 范围。
