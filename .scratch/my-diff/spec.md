# my-diff — /diff TUI diff 查看器

Status: ready-for-agent

## Problem Statement

在 pi 会话中想快速查看工作区改动时，只有两个选择：让 agent 跑 `git status` / `git diff`（每次都要 LLM 往返、消耗 token、diff 输出混在对话流里不便翻阅），或切到别的终端工具。缺少一个即时、纯本地、不打扰会话的查看入口。

## Solution

新增 `/diff` 命令（ly-pi 新子模块 my-diff）：触发后弹出 git status 文件选择器，用户选中一个文件后全屏展示该文件相对 HEAD 的合并 diff（untracked 文件展示全文）。Esc 返回列表继续挑选，列表上再 Esc 退出。全程 TUI 原生交互，agent 不参与、零 token 消耗。

## User Stories

1. As a pi 用户, I want 输入 `/diff` 弹出文件选择器列出工作区全部改动, so that 我不必让 agent 跑 git status 就能总览改了哪些文件
2. As a pi 用户, I want 列表同时包含已跟踪文件的改动和 untracked 新文件, so that 新建的文件也不会漏看
3. As a pi 用户, I want 每个条目显示单字母状态标记（M 修改 / A 新增 / ? untracked）加仓库相对路径, so that 我一眼能分辨改动的性质
4. As a pi 用户, I want 条目按路径字母序排列, so that 列表顺序稳定可预测，我能凭肌肉记忆找到文件
5. As a pi 用户, I want 同一文件兼有 staged 和 unstaged 改动时只出现一次, so that 列表不重复、不造成选择困惑
6. As a pi 用户, I want 选中已跟踪文件后看到 `git diff HEAD` 合并视图, so that 我能一次看到该文件相对上次提交的全部改动（staged + unstaged）
7. As a pi 用户, I want 选中 untracked 文件后看到文件全文, so that 没有 diff 可言的新文件也能被查看
8. As a pi 用户, I want diff 行用主题配色区分增删（toolDiffAdded/Removed/Context）, so that 视图与我熟悉的 pi 工具输出视觉一致
9. As a pi 用户, I want diff 视图支持 ↑↓/PgUp/PgDn 滚动且标题栏显示状态与路径, so that 长 diff 也能完整翻阅且始终知道自己在看哪个文件
10. As a pi 用户, I want 看完一个文件按 Esc 返回列表继续挑下一个, so that 一次 `/diff` 就能 review 完一圈改动
11. As a pi 用户, I want 在列表上按 Esc 退出命令, so that 浏览结束时能干净地回到会话
12. As a pi 用户, I want 工作区干净时看到 "working tree clean" 提示后退出, so that 我不对着空列表困惑
13. As a pi 用户, I want 在非 git 仓库里运行 `/diff` 得到明确提示, so that 我知道命令为什么不工作
14. As a pi 用户, I want 选中二进制文件时看到提示文案而非乱码, so that 视图不会被不可读内容污染
15. As a pi 用户, I want 超过 500 行的 diff/全文只显示提示文案, so that TUI 不被超长输出拖垮，我也不会陷入无尽滚动
16. As a pi 用户, I want 冲突文件不特殊处理（按 git diff HEAD 原样输出）, so that 实现保持简单，我仍能看到原始信息

## Implementation Decisions

- **载体**：ly-pi 新子模块 `my-diff`，与现有 10 个 my-* 模块同构；用 `pi.registerCommand("diff")` + `ctx.ui.custom()`（SelectList 选择器 + 可滚动 diff 视图）实现；pi 无内置 `/diff`，命名无冲突
- **git 接缝**：所有 git 输出在进入模块处解析为领域对象；三个命令——`git status --porcelain`（列表）、`git diff HEAD -- <file>`（已跟踪 diff）、读文件全文（untracked）
- **列表模型**：porcelain 解析后映射为 `{ status: "M" | "A" | "?", path }`，同路径去重（staged/unstaged 合并为一条），按路径字母序
- **视图模型**：`toDiffView` 统一产出「可渲染内容」——正常文本 / 超 500 行占位文案 / 二进制占位文案；行数判断在换行符统计层面完成
- **边界行为**：工作区干净与非 git 仓库均为提示后退出；冲突文件不特殊处理
- **TDD**：先写失败测试再实现；覆盖率达标后 `bun run deploy` + `/reload` 验证
- **不做参数直达**：`/diff` 不接受文件参数，只有选择器流程

## Testing Decisions

- 好测试标准：只测外部行为（fixture 字符串进、领域对象/视图模型出），不测实现细节
- 测试接缝照 my-hud 惯例：纯函数 100% 覆盖，`exec` 薄壳不直接测，`index.ts` 作为 TUI 集成壳按 vitest.config 既有规则排除出覆盖率
- 被测模块：
  - `parseStatusList`：porcelain fixture 覆盖 M/A/? 映射、同文件去重、路径排序、引号包裹路径
  - `toDiffView`：untracked 全文直通、diff 直通、>500 行占位、二进制占位、空状态
  - `formatListItem`：状态字母 + 路径的展示格式
- Prior art：`my-hud/git.test.ts`（纯解析器 fixture 测试）、my-sound/my-hud 的模块拆分与 index.ts 排除模式

## Out of Scope

- `/diff <path>` 参数直达（后续需要时零成本可加）
- staged / unstaged 分段展示（已定为 `diff HEAD` 合并视图）
- 把 diff 注入会话给 agent（本期定位纯人看；衔接 agent 工作流是潜在后续方向）
- 超长 diff 的分页/截断展示（超过 500 行直接不展示）
- 从 my-hud/git.ts 抽共享 git 库（两处各用一次的逻辑不值得抽象）

## Further Notes

- 设计经 grill-with-docs 三轮拷问收敛（用途 → 载体/导航/边界 → 阈值/列表格式），无 CONTEXT.md 术语冲突；载体选择不构成 ADR（模块自包含、易逆转）
- 部署链路：`bun run deploy` 后 `/reload` 生效
