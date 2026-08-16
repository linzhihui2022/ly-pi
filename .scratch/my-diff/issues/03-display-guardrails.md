# 03 — 展示护栏：二进制与超长输出占位

**What to build:** 选中二进制文件（或二进制 diff）时，视图显示提示文案（如 "Binary file, not shown"）而非乱码。diff 或全文的输出超过 500 行时，同样只显示提示文案而不渲染内容，避免 TUI 被超长输出拖垮。

**Blocked by:** 01 — 打通主干：/diff 选择器 + 已跟踪文件 diff 直通

**Status:** ready-for-agent

- [ ] 二进制文件/diff 选中后显示占位提示文案
- [ ] 输出超 500 行（diff 与 untracked 全文同标准）显示占位提示文案
- [ ] 恰好 500 行正常展示，501 行触发占位（边界清晰）
- [ ] 二进制检测与行数阈值分支有单元测试，覆盖率达标
- [ ] `bun run check-docs` 通过
