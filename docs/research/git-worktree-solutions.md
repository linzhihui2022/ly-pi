# Pi Coding Agent 生态中的 Git Worktree 解决方案调研

> 调研日期：2026-08；范围：pi 官方仓库（badlogic/pi-mono，现迁移至 earendil-works/pi）、npm pi-* 包、社区实践。
> 所有结论均附一手来源链接。

## TL;DR

pi 核心刻意不内置 subagent/worktree，worktree 能力全部由社区扩展提供。生态已相当成熟：
**`pi-subagents`（nicobailon）的 `worktree: true`** 是脚本化并行子代理隔离的主流方案（本仓库已在用）；
需要 tmux 交互式编排可看 `pi-side-agents`（pasky）和 `pi-git-worktrees`（RielJ）；
需要完整隔离开发环境（独立 node_modules/数据库/端口）可看 `pi-worktree`（nicepkg）。
主要坑集中在「扩展无法在运行时切换会话 cwd」和「node_modules / direnv / 项目本地扩展在 worktree 下的行为」。

---

## 1. 官方立场：worktree 不属于核心

- pi 的设计哲学是"最小 agent harness"：**官方明确不内置 sub-agents、plan mode，让扩展按需实现**。"Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way."
  来源：https://pi.dev/ 、https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md
- 官方 examples 里与安全/隔离相关的扩展示例（`dirty-repo-guard.ts`、`protected-paths.ts` 等）可作为 worktree 工作流中"守卫"的参考。
  来源：https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions
- 仓库已从 `badlogic/pi-mono` 迁移/镜像到 `earendil-works/pi`（issue 编号一致，两边都能访问）。

## 2. pi-subagents 的 worktree 支持（本仓库现役方案）

npm 包 `pi-subagents`（nicobailon/pi-subagents）是目前下载量最大、文档最全的子代理扩展，其 worktree 机制：

- **用法**：在 `workflowScript` 中对每个 `runs.run` / `runs.all` 项设 `worktree: true`；顶层 `{ workflowScript, worktree: true }` 可将隔离设为所有子代理默认，单个子代理可用 `worktree: false` 覆盖。
  来源：https://github.com/nicobailon/pi-subagents/blob/main/docs/workflows.md
- **生命周期**：每个子代理从**干净的 HEAD** 拉新分支 → 启动前 journal 记录所有权 → 完成后**捕获 patch 和 handoff manifest** → **自动删除已干净捕获的临时 worktree 和分支**。manifest 路径保留在子代理的 `artifactPaths` 中供编排者应用/审查补丁。
  来源：https://github.com/nicobailon/pi-subagents/blob/main/docs/workflows.md
- **node_modules 处理**：内置 `linkNodeModulesIfPresent()`——若主 checkout 根目录有 `node_modules`，在 worktree 中**自动创建符号链接**（symlink 失败时静默跳过，如 CI 不支持的文件系统）。
  来源：https://cdn.jsdelivr.net/npm/pi-subagents@0.45.2/src/runs/shared/worktree.ts
- **worktreeSetupHook**：可配置每创建一个 worktree 执行一次的脚本（`worktreeSetupHook` + `worktreeSetupHookTimeoutMs`，默认 30s）。stdin 传入 JSON（`repoRoot`、`worktreePath`、`agentCwd`、`branch`、`index`、`runId`、`baseCommit`），stdout 返回如 `{"syntheticPaths": [".venv", ".env.local"]}`——这些路径会在 diff 捕获前被移除，避免辅助文件污染补丁；tracked 文件不可标记为 synthetic。
  来源：https://github.com/nicobailon/pi-subagents/blob/main/docs/configuration.md
- **worktreeBaseDir**（v0.32.0 新增，源自社区贡献 issue #185）：默认 worktree 建在 `os.tmpdir()`（macOS 上是 `/private/var/folders/...`），会触发 **direnv 拦截子代理的几乎所有 shell 命令**。现在可通过 `worktreeBaseDir` 配置项或 `PI_SUBAGENTS_WORKTREE_DIR` 环境变量指定稳定基目录（相对路径基于 repo root，支持 `~/`）。
  来源：https://github.com/nicobailon/pi-subagents/issues/185 、https://github.com/nicobailon/pi-subagents/releases/tag/v0.32.0

## 3. 生态中的 worktree 扩展包（按定位分类）

### 3.1 并行子代理编排（agent orchestration）

| 包 | 定位 | 要点 |
|---|---|---|
| [`pi-subagents`](https://github.com/nicobailon/pi-subagents) | 脚本化子代理 + worktree 隔离 | 见第 2 节；另有 `@gotgenes/pi-subagents` fork 系（见下） |
| [`pi-side-agents`](https://github.com/pasky/pi-side-agents)（pasky） | tmux window + worktree 的"一次性 side agent" | `/agent <task>` 起后台子代理，各居独立 tmux 窗口 + 短生命周期 topic 分支 worktree；`/agents` 查看；**审查后输入 "LGTM, merge" 自动合并**；**旧 worktree 保留复用、旧分支在新代理复用时自动 prune**；提供 `agent-start/agent-check/agent-wait-any/agent-send` 工具让父代理编排；附 `agent-setup` skill 生成项目专属的 worktree 初始化/合并脚本 |
| [`pi-git-worktrees`](https://github.com/rielj/pi-git-worktrees)（RielJ） | tmux 浮窗多 worktree 编排 | `wt_new/wt_send/wt_wait/wt_gather/wt_context` 工具 + `/worktrees` 交互面板 + 状态 widget + 心跳检测；隐藏 tmux session `_pi-wt` 管理全部 worktree agent；fan-out/wait/gather 编排模式 |
| `@gotgenes/pi-subagents-worktrees` | worktree 隔离抽成独立包 | gotgenes 系把 worktree 隔离从 pi-subagents 核心抽出，实现 `WorkspaceProvider` 接口（ADR 0002："worktree 只是工作区策略之一，非子代理的本质"）。来源：https://github.com/gotgenes/pi-packages/issues/263 |

### 3.2 交互式 worktree 管理（slash command 类）

- [`pi-worktree`](https://www.npmjs.com/package/pi-worktree)（nicepkg，作者 xiaoyu2er）：**完整隔离开发环境**——每个 worktree 独立分支、数据库、依赖、端口，通过项目级 hooks 自动化（灵感来自 Claude Code 的 `claude --worktree`）。检测到 cmux/tmux 时自动在同终端重启 pi 进入 worktree，否则打印路径手动 `cd && pi`。
- [`@thisux/pi-worktree`](https://github.com/thisuxhq/pi-worktree)：`/worktree ls|add|open|rm|pr`，支持**直接为 PR 检出 worktree**（PR 审查隔离场景）。
- [`@pandi-coding-agent/worktree`](https://www.npmjs.com/package/@pandi-coding-agent/worktree)：`/worktree` 命令 + 模型可调用的 `git_worktree` 工具（list/add/open/remove/prune）。
- [`@rezamonangg/pi-worktree`](https://github.com/rezamonangg/pi-worktree)：**把文件/shell 工具调用路由进隔离 worktree**，主 checkout 完全不被污染；含 status/diff/sync/commit/stop/cleanup 生命周期工具 + 教 agent 何时用 worktree 的 skill。
- [`@narumitw/pi-worktree`](https://www.npmjs.com/package/@narumitw/pi-worktree)：安全的交互式 worktree 管理与工作区切换（周下载 ~1200，slash command 类中最活跃）。
- [`@ogulcancelik/pi-worktree`](https://www.npmjs.com/package/@ogulcancelik/pi-worktree)：**把当前会话迁移到另一个 worktree 且保留对话历史**。
- [`pi-worktrees`](https://github.com/cobbman/pi-worktrees)（cobbman）：刻意保持小的 `/worktree` 命令集（init/create/switch/remove），shell-safe git 执行。
- 更多可见官方包目录 https://pi.dev/packages 和 awesome 列表 https://github.com/qualisero/awesome-pi-agent

## 4. 官方核心与 worktree 相关的已知问题（坑）

这些 issue 直接影响 worktree 扩展的行为，使用前须知：

1. **扩展无法在运行时切换会话 cwd**（#2102，已 closed/completed）：工具在 `createAllTools()` 时通过闭包绑定 cwd，`session_start` 晚于绑定，扩展无法重定向工具操作目录。nicepkg/pi-worktree 作者当时的 workaround 是杀掉 pi 再用 cmux/tmux send-keys 注入 `cd && pi`。
   来源：https://github.com/badlogic/pi-mono/issues/2102
2. **bash 工具在 `process.chdir()` 后仍用旧 cwd**（#2489）：`AgentSession._cwd` 构造时设定后不再更新。
   来源：https://github.com/badlogic/pi-mono/issues/2489
3. **`setCwd` 缺失**（#2992，completed）：0.65.0 起 footer 从 `sessionManager.getCwd()` 读取（会话创建时冻结），扩展 `process.chdir()` 进 worktree 后 footer/git 分支/bash cwd/autocomplete 全部不更新。
   来源：https://github.com/badlogic/pi-mono/issues/2992
4. **cwd bridge 只捕获不传播**（#5478）：pi 每次 bash 执行后捕获了有效 cwd，但写入全局变量后没有任何调用方读回，`cd` 在 bash 子进程里"静默成功"，后续工具/footer/autocomplete 仍指向启动目录。
   来源：https://github.com/earendil-works/pi/issues/5478
5. **项目本地扩展跨 worktree 冲突**（#2558）：同一 checkout 的多个 worktree 同时出现在一个会话时，`.pi/extensions` 会重复注册同名 command/tool。
   来源：https://github.com/badlogic/pi-mono/issues/2558
6. **`@` autocomplete 在 worktree 中结果不同**（#2778，closed）：`fd --full-path` 受 worktree 路径文本影响（如路径中含 `clone`）。
   来源：https://github.com/badlogic/pi-mono/issues/2778
7. **`/resume` All scope 不更新 cwd**（#2024，closed）：跨工作区恢复会话时历史加载了但工作目录不切。
   来源：https://github.com/badlogic/pi-mono/issues/2024
8. **pi-subagents worktree 默认落 tmpdir 触发 direnv**（nicobailon #185，已修复）：见第 2 节 `worktreeBaseDir`。
9. **gotgenes 系：子代理继承父级"当前工作目录"声明**（#640）：父系统提示被原样前置到 child 的 envBlock 之前，抵消了 WorkspaceProvider/worktree 隔离效果（bug， pkg:pi-subagents-worktrees）。
   来源：https://github.com/gotgenes/pi-packages/issues/640

## 5. node_modules / monorepo / 包管理器对策

- **pi-subagents 内建策略**：symlink 主 checkout 的 `node_modules` 到 worktree（第 2 节）。简单但对 **monorepo（各包有自己的 node_modules）不够用**——只链接根目录。
- **pnpm 官方方案**：pnpm 官网有专文《pnpm + Git Worktrees for Multi-Agent Development》：每个 worktree 各自 `pnpm install`，但依赖经全局 content-addressable store 共享磁盘，多 agent 并行成本可控。
  来源：https://pnpm.io/git-worktrees
- **bun workspaces**：未找到 pi 社区针对 bun workspaces + worktree 的专门方案。推断可行路径：pi-subagents 的 symlink 只覆盖根 `node_modules`，bun workspace 子包若依赖 hoist 到根则基本可用；否则需用 `worktreeSetupHook` 在 worktree 里跑 `bun install`（bun install 速度快、有全局缓存，成本可接受）。
- **数据库/端口/env 隔离**：nicepkg `pi-worktree` 的项目级 hooks 思路（每 worktree 独立 db/env/端口）是需要"全栈并行验证"时的参考实现。
  来源：https://www.npmjs.com/package/pi-worktree
- **pi 自身包管理与 pnpm 的摩擦**：`pi install`/`pi update` 对 `git:` 包硬编码 `--omit=dev`，pnpm 下会报错（#3604）。
  来源：https://github.com/earendil-works/pi/issues/3604

## 6. 对本仓库（ly-pi / bun workspaces）的落地建议

1. **继续以 `npm:pi-subagents` 的 `worktree: true` 为主力**：本仓库 AGENTS.md 已规定子代理运行时为 `npm:pi-subagents`，其 worktree 生命周期（干净 HEAD 分支 → patch 捕获 → 自动清理）已覆盖"并行子代理隔离"需求，无需新增依赖。
2. **配置 `worktreeBaseDir`**：在 `ly-pi/assets/config/` 的 subagents 配置（如 `subagents.json`）中设置稳定基目录（如 `~/.pi/worktrees` 或 repo 相对 `.worktrees/`），避开 tmpdir + direnv 的坑（#185），并方便人工检查残留 worktree。
3. **编写 `worktreeSetupHook` 脚本**：处理 bun workspaces 场景——在 hook 中对 worktree 执行 `bun install --registry https://registry.npmmirror.com`（或视 hoist 情况仅依赖根 node_modules symlink），并用 `syntheticPaths` 声明 `.env*`、`*.log` 等，避免污染 patch。
4. **需要交互式并行编排时再引入 tmux 系方案**：`pi-side-agents`（pasky）的"/agent 起任务 → LGTM merge → worktree 复用"流程最贴近"边干活边开支线"的人工监督模式；`pi-git-worktrees`（RielJ）适合纯自动 fan-out/gather。两者都强依赖 tmux，与本仓库 wezterm 配置共存需验证。
5. **PR 审查隔离场景**可单独装 `@thisux/pi-worktree`（`/worktree pr` 直接检出 PR 到 worktree），与现有 `review-pr` skill 互补。
6. **避坑清单**：
   - 不要依赖扩展在会话中途 `process.chdir()` 进 worktree——工具 cwd 闭包绑定问题虽部分修复（#2102/#2992 completed），但 #5478 显示 cwd 传播链仍未完全打通；优先用"子代理直接在 worktree 路径启动"（pi-subagents 的模式）而非"会话内切换"。
   - 多 worktree 同开会话时注意项目本地 `.pi/extensions` 重复注册（#2558）。
   - 主 checkout 保持干净：worktree 方案均假设从干净 HEAD 分支，主树有未提交改动时先 stash/commit。
7. **变更后按仓库规范跑 `bun run check-docs`** 验证文档一致性。

## 附：来源清单

保留（一手来源）：
- pi.dev 官网与 badlogic/pi-mono README — 官方立场
- nicobailon/pi-subagents docs（workflows.md / configuration.md）+ issues #185 + release v0.32.0 + worktree.ts 源码 — worktree:true 机制细节
- badlogic/pi-mono (earendil-works/pi) issues #2102 #2489 #2992 #5478 #2558 #2778 #2024 — 官方核心坑
- pasky/pi-side-agents、rielj/pi-git-worktrees README — tmux 编排实践
- npm/pi.dev 包页：pi-worktree、@thisux/pi-worktree、@pandi-coding-agent/worktree、@rezamonangg/pi-worktree、@narumitw/pi-worktree、@ogulcancelik/pi-worktree、cobbman/pi-worktrees — 生态包盘点
- gotgenes/pi-packages issues #263 #640 — WorkspaceProvider 抽象与其 bug
- pnpm.io/git-worktrees — 包管理器官方多 agent worktree 指南
- qualisero/awesome-pi-agent、pi.dev/packages — 社区目录

丢弃：
- thomas-wiegold.com、alexander.holbreich.org 等评论性博文 — 非一手，无 worktree 实质内容
- jspm/store.boilerplate 等 npm 镜像页 — 与 npm 原文重复
- johansabent/pi-subagents-jp、@yassimba/pi-subagents 等 fork 副本 — 内容为上游拷贝

## 未解问题（Gaps）

- bun workspaces + worktree 的组合在 pi 社区无现成最佳实践，上述建议 3 需实测验证。
- #5478（cwd bridge 不传播）是否已在最新版本修复未确认，需要时查 pi changelog。
- Discord 社区讨论未检索（无公开可抓取归档）；如需可人工翻 pi Discord 的 #extensions 频道。
