# 01 — 打通主干：/diff 选择器 + 已跟踪文件 diff 直通

**What to build:** 输入 `/diff` 弹出 git status 选择器，列出已跟踪文件的改动（M 修改 / A 新增，单字母标记 + 仓库相对路径，同文件 staged+unstaged 去重为一条，按路径字母序）。选中文件后全屏展示该文件 `git diff HEAD` 的合并视图，用主题增删配色渲染，支持 ↑↓/PgUp/PgDn 滚动，标题栏显示状态与路径。Esc 返回列表继续挑选，列表上再 Esc 退出命令。工作区干净时提示 "working tree clean" 后退出；非 git 仓库给出明确提示后退出。本票同时交付 my-diff 模块脚手架：目录结构、ly-pi/index.ts 接线、README 扩展表新增行。全程 TDD，agent 不参与交互。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `/diff` 注册为扩展命令，触发后弹出 SelectList 选择器
- [x] 列表仅含已跟踪改动（M/A），单字母 + 相对路径，去重，按路径字母序
- [x] 选中后展示 `git diff HEAD -- <file>` 合并视图，主题 diff 配色，可滚动，标题栏含状态与路径
- [x] diff 视图 Esc 返回列表，列表 Esc 退出（循环浏览）
- [x] 工作区干净 → "working tree clean" 提示后退出；非 git 仓库 → 提示后退出
- [x] 模块脚手架完成：ly-pi/index.ts 接线、README 扩展表加行
- [x] parseStatusList / formatListItem / diff 直通视图模型均有 fixture 驱动的单元测试，覆盖率达标
- [x] `bun run check-docs` 通过

## Comments

实现备忘（2026-08）：

- 纯逻辑：`git.ts`（porcelain 解析 + exec 薄壳）、`view.ts`（视图模型 + diff 行分类）；`index.ts` TUI 壳按 vitest.config 惯例排除出覆盖率
- 删除/重命名/冲突统一映射为 `M`（相对 HEAD 的改动），重命名取新路径；porcelain 引号路径做了 unquote
- porcelain 中 `??`（untracked）在 01 里被过滤，02 会重新启用并接通全文展示
- TUI：`SelectList` + `DynamicBorder` 选择器（`getSelectListTheme()` 无参，读全局主题）；diff 视图为自绘滚动组件（↑↓/PgUp/PgDn，预算 = terminal.rows - 8），主题 token `toolDiffAdded/Removed/Context`
- 中途澄清：曾提出「全程框定在 pi widget 里」诉求，调查确认 `setWidget` 纯展示不接收键盘输入，用户权衡后选择维持 ui.custom 原设计
- 已 `bun run deploy`；`/reload` 后可手动验证

Review 修复（code-review 双轴后）：git status 改用 `-c core.quotepath=false`（修复 CJK 路径八进制转义被 unquote 损坏的问题，unquote 删除）；排序从 localeCompare 改为码元序（locale 无关）；git status 超时不再误报「不是 git 仓库」（仅 not-a-repo 返回 null，其余失败抛出并提示）；移除 diff 视图底部进度指示（spec 未要求）；清除 ticket-01 残留过期注释。
