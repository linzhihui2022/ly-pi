# 02 — untracked 新文件进列表、选中看全文

**What to build:** git status 选择器额外列出 untracked 新文件（`?` 单字母标记，与已跟踪条目一起按路径字母序混排）。选中 untracked 文件时展示文件全文（新文件没有 diff 可言，全文即其「改动」）。

**Blocked by:** 01 — 打通主干：/diff 选择器 + 已跟踪文件 diff 直通

**Status:** resolved

- [x] untracked 文件以 `?` 标记出现在选择器中，与 M/A 条目统一按路径排序
- [x] 选中 untracked 文件展示文件全文，标题栏状态显示 `?`
- [x] untracked 读取失败（如选中后被删除）有兜底提示而非崩溃
- [x] parseStatusList 与视图模型的 untracked 分支有单元测试，覆盖率达标
- [x] `bun run check-docs` 通过

## Comments

实现备忘（2026-08）：

- `parseStatusList` 放开 `??` 映射为 `?`，`!!`（ignored）仍排除；与跟踪条目统一按路径混排
- untracked 全文经 `fetchUntrackedContent`（fs.readFile，薄壳不测）走与 diff 相同的 `buildDiffView` 管线，标题 `? <path>`
- 读取失败（选中后文件被删等）与 diff 失败共用 try/catch：notify 后返回列表，不崩溃
- 注意：02 本身不含二进制护栏——untracked 二进制文件会直出全文，占位提示由 03 补上
- 已 `bun run deploy`；`/reload` 后可验证
