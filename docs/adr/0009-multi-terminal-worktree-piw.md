# 并行开发：多终端手动并行 + piw，不引入社区 worktree 扩展

针对「同时在不同 worktree 解决多个事务、互不干扰」的需求，选定**多终端手动并行**模式：`git worktree` 建隔离工作区，自写 `piw` 命令在新 WezTerm tab 以指定 CWD 启动 pi。不安装任何社区 worktree 扩展。

调研依据见 `docs/research/git-worktree-solutions.md`（pi 社区 worktree 生态一手来源调研）。

## Considered Options

- **`pi-subagents` 的 `worktree: true`（会话内编排）**：保留作为脚本化子代理隔离的既有能力，但不满足本需求——用户要的是自己盯多个交互式会话，而非一次性 fan-out 任务。
- **`@thisux/pi-worktree` 扩展**：被拒绝。其工作流（建 worktree → 复制路径 → 人工开新终端）与「纯 git 命令 + piw」完全等价，安装它只多一层依赖，没有新增能力。
- **`@narumitw/pi-worktree` 扩展（会话内切换）**：被拒绝。它通过 fork session 文件 + `switchSession` API 重建会话来绕开 pi 的 cwd 闭包绑定（#2102/#2489/#2992），机制上是生态内最稳的切换方案，但正确性押在 pi 会话替换 API 的语义上，cwd 传播链至今未完全打通（#5478）。多终端模式每个终端本就是全新会话，无需承担此风险。
- **tmux 系自动编排（pi-side-agents / pi-git-worktrees / nicepkg pi-worktree）**：被拒绝。强依赖 tmux，与本仓库 WezTerm 配置共存需额外验证；自动派生会话的收益不抵引入终端复用器的复杂度。
- **自写 `piw.zsh`（采纳）**：`wezterm cli spawn --cwd <dir> -- pi` 一条命令完成「新 tab + 指定 CWD + 启动 pi」，5 行、零依赖、与 worktree 解耦。纳入仓库根目录管理，`~/.zshrc` 以 `source` 引入（`.zshrc` 含机器特定内容，不适合整体软链）。

## Consequences

- 并行工作流为：主仓库 `git worktree add ../configure-<分支>` → `piw ../configure-<分支>` → 完事回主会话合并后 `git worktree remove`。
- 各终端的 pi 会话完全独立，无共享对话上下文——隔离最彻底，代价是上下文不可跨会话携带。
- worktree 落在仓库兄弟目录（`../configure-<分支>`），不入 `.gitignore` 管理，依赖人工清理。
- 若未来需要会话内切换或自动派生，再评估 `@narumitw/pi-worktree` 或 tmux 系方案；届时需复查 pi 核心 cwd 相关 issue 的修复状态。
