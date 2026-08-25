# configure

[![verify](https://github.com/linzhihui2022/ly-pi/actions/workflows/verify.yml/badge.svg)](https://github.com/linzhihui2022/ly-pi/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

围绕 [Pi Coding Agent](https://pi.dev) 构建的个人开发环境：15 个 Pi 扩展合并为统一入口 `ly-pi`，扩展代码与配置、技能、主题、子代理统一收纳在 `ly-pi/assets/` 随部署分发；含 PR 审查子代理定义、Catppuccin Mocha 主题、Starship / WezTerm 终端配置等。

## 特性

- **统一扩展入口 `ly-pi`**：单一 `index.ts` 按序注册 15 个子模块，部署到 `~/.pi/agent/extensions/ly-pi/` 由 Pi 自动发现加载
- **权限拦截器**：确定性规则 + 模型法官二审工具调用，可逐项目定制
- **开发体验**：自定义 HUD 状态栏、`/diff` 查看器、`/html` 渲染、事件音效、`/back` 撤销消息、热重载自动恢复
- **行为护栏**：冗余 `cd` 前缀自动纠正、内联长脚本硬拦截
- **一键部署**：`bun run deploy` 完成 build → test → 部署扩展/技能/主题/子代理/配置

---

## 目录结构

```
configure/
├── ly-pi/                    # 统一扩展入口（单包，含全部 15 个子模块）
│   ├── index.ts              # 入口：按序注册所有子模块
│   ├── my-cd-guard/          # 冗余 cd 前缀自动纠正
│   ├── my-script-guard/      # 内联脚本硬拦截 + 急迫升级
│   ├── my-log/               # 开发日志：/ly-log 命令 + 浏览器查看
│   ├── my-permission/        # 工具调用权限拦截器 + 模型法官
│   ├── my-reload/            # 扩展热重载自动恢复
│   ├── my-back/              # /back 命令
│   ├── my-diff/              # /diff 命令：git status 选择器 + diff 查看器
│   ├── my-html/              # /html 渲染
│   ├── my-sound/             # 音效反馈 + 语音包管理
│   ├── my-session-name/      # 自动生成 Session Display Name
│   ├── my-hud/               # 自定义 HUD 状态栏
│   ├── my-tool-display/      # 原生工具紧凑呈现
│   ├── my-worktree/          # 只读 worktree 组件 + /close-worktree 安全关闭命令
│   ├── my-vision/            # 按模型视觉能力注入图片处理规则
│   ├── web-preview/          # 内部工具库：HTML 预览 server + 文档骨架
│   ├── shared/               # 跨模块共享（guard-harness 等）
│   ├── assets/               # 部署资产（随 bun run deploy 分发到 ~/.pi/agent/）
│   │   ├── config/           # 纯配置源文件：settings、mcp、tool-display、sound 等
│   │   ├── skills/           # 仓库自有技能（review-pr、gh-build-weekly-timesheet）
│   │   ├── themes/           # Catppuccin Mocha 主题
│   │   └── agents/           # 子代理定义（PR 审查角色 + image-reader）
│   └── settings-schema.json  # settings.json 的运行时校验 schema（部署时校验）
├── scripts/
│   └── deploy-all.ts         # 统一部署流水线（build → test → deploy all）
├── tools/check-docs/         # 文档一致性校验
├── docs/agents/              # Matt skills 配置（issue tracker、标签、domain docs）
├── .scratch/                 # 本地 issue tracker：需求规格与票据
│
├── starship.toml             # Starship 终端提示符
├── wezterm.lua               # WezTerm 终端配置
├── MY-AGENTS.md              # 全局 Agent 指令 → ~/.pi/agent/AGENTS.md、~/.claude/CLAUDE.md、~/.dsh/AGENTS.md
├── AGENTS.md                 # configure 仓库自身的开发指南
├── JUDGE.md                  # my-permission 模型法官的项目级规则
├── biome.json                # Biome 格式/lint 配置
├── install.sh                # 一键部署入口
└── package.json              # Monorepo 根配置
```

---

## 🧩 Pi 扩展（统一入口 `ly-pi`）

| 子模块 | 功能 |
|--------|------|
| **my-cd-guard** | 冗余 cd 前缀自动纠正：原地剥掉指向会话工作目录的 `cd <cwd> &&` 前缀并通知用户 |
| **my-script-guard** | 内联脚本 + 写文件旁路硬拦截：拦截 bash 中的 `-c`/`-e`/heredoc 长脚本，被拦 3 次后升级为用户确认 |
| **my-log** | 开发日志：`/ly-log on|off` 开关 + `/ly-log` 浏览器查看会话日志，供其他模块通过 `createDevLogger` 接入 |
| **my-model-policy** | `/models-doctor`：展示 Model Role、候选来源、能力诊断和实际主模型相对初始选择的偏离，不发送模型请求 |
| **my-permission** | 工具调用权限拦截器：确定性规则 + 模型法官 + 子代理差异化处理 |
| **my-reload** | 扩展热重载自动恢复：`request_reload` 工具标记后，reload 完成自动发送继续指令 |
| **my-back** | `/back` 命令：撤销最近一条用户消息并将文本放回编辑器 |
| **my-diff** | `/diff` 命令：git status 选择器 + 主题配色 diff 查看器（纯 TUI，不经过 agent） |
| **my-html** | `/html` 命令：将助手回复渲染为 Markdown HTML，浏览器中预览 |
| **my-sound** | 音效反馈 + 语音包管理：会话/工具事件触发音频，`/sound` 命令控制，支持多语音包切换 |
| **my-session-name** | 自动生成 Session Display Name：首条 prompt 后异步摘要，支持旧 session 补命名与 fork 短 hash |
| **my-hud** | 自定义单行状态栏：项目名、模型（含思考级别）、Git 分支与状态、PR 链接、上下文百分比（颜色阈值）、Token 与成本、权限统计、Hide thinking 状态 |
| **my-tool-display** | Pi 原生工具的紧凑呈现；当前覆盖 `read`、`grep`、`find`、`ls`、`bash`、`edit`、`write`：读/搜索成功正文默认隐藏，bash 成功输出默认显示最多 10 行，edit/write 完成后显示主题化统一 diff；write 对二进制、过大、不可读或工作区外路径安全降级，失败始终显示诊断 |
| **my-worktree** | 只读 Worktree Widget 在多 Git worktree 时显示可访问工作树；`/close-worktree` 经确认后安全关闭 Current Worktree，保留本地分支，并通过用户配置的终端 hook 收尾 |
| **my-vision** | 按当前模型视觉能力逐轮注入图片处理规则：视觉模型直接 `read` 读图，非视觉模型委托 `image-reader` 子代理 |

---

## 🎯 技能

- **仓库自有**（`ly-pi/assets/skills/`，随 deploy 快照式部署）：
  - `review-pr` — 并行调度专职 reviewer 子代理做多维度 PR 审查
  - `gh-build-weekly-timesheet` — 手动根据 GitHub PR 提交证据生成可审计的工时表（需要 Python 3.9+ 和已认证的 `gh` CLI）
- **由 [mattpocock/skills](https://github.com/mattpocock/skills) 工作流提供**（外部安装，不镜像到本仓库），驱动「需求与规格」流程

---

## 🎨 主题

- **Catppuccin Mocha** — 深色主题，完整覆盖 TUI 元素。源文件在 `ly-pi/assets/themes/catppuccin-mocha.json`，部署到 `~/.pi/agent/themes/`。

---

## 🤖 子代理

运行时使用 [`pi-subagents`](https://pi.dev/packages/pi-subagents)。通用角色（scout、delegate、researcher、context-builder、planner、oracle、reviewer、worker）由 `pi-subagents` 官方包提供；`ly-pi/assets/agents/*.md` 只保留 PR 审查角色（另有 `image-reader` 供 my-vision 委托非视觉模型读图），部署到 `~/.pi/agent/agents/`。通用角色的模型与 fallback 由 `ly-pi/assets/config/settings.json` 统一覆盖。

| 子代理 | 用途 |
|--------|------|
| pr-code-reviewer | PR 通用代码审查：项目规范、bug 检测、代码质量 |
| pr-comment-analyzer | PR 注释与文档审查：准确性、完整性、可维护性 |
| pr-silent-failure-hunter | PR 静默失败审查：错误处理、fallback、异常抑制 |
| pr-test-analyzer | PR 测试覆盖审查：质量、完整性、行为覆盖 |
| pr-type-design-analyzer | PR 类型设计审查：封装、不变量、类型表达 |

---

## 🚀 安装

### 前置依赖

- [Bun](https://bun.sh) 与 [Pi Coding Agent](https://pi.dev) ≥ 0.84.2
- 可选：[Starship](https://starship.rs)、[WezTerm](https://wezterm.org)（仅在使用对应终端配置时需要）

```bash
REPO="$HOME/Documents/configure"

# 克隆
git clone https://github.com/linzhihui2022/ly-pi "$REPO"

# 安装依赖
cd "$REPO" && bun install

# 安装子代理运行时
pi install npm:pi-subagents

# 创建符号链接
ln -sf "$REPO/starship.toml" ~/.config/starship.toml
ln -sf "$REPO/wezterm.lua" ~/.wezterm.lua
ln -sf "$REPO/MY-AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$REPO/MY-AGENTS.md" ~/.claude/CLAUDE.md
ln -sf "$REPO/MY-AGENTS.md" ~/.dsh/AGENTS.md

# 部署扩展、技能、主题、子代理、设置、MCP
"$REPO/install.sh"
```

### 从 pi-tool-display 迁移

`my-tool-display` 验证完成并由用户在 TUI 中确认后，手动卸载旧的第三方扩展：

```bash
pi uninstall npm:pi-tool-display
```

部署流程不会自动卸载用户级 npm 包；在手动卸载前，会部署 `enabled: false` 的兼容配置，前提是旧扩展支持该字段。完成 TUI 验证后再执行上述命令。

### API key（可选）

以下功能按需配置环境变量，不配置则对应功能不可用，其余不受影响：

| 环境变量 | 用途 | 获取 |
|----------|------|------|
| `CONTEXT7_API_KEY` | Context7 MCP 服务器 | https://context7.com |
| `TAVILY_API_KEY` | Tavily 网页搜索 | https://app.tavily.com/ |

### 音效（用户自备）

音效文件**不随仓库分发**。将音频放入 `~/.ly-pi/sound/<pack-name>/`，在 `my-sound.json` 的 `packs` 中注册（`soundDir` 相对 `~/.ly-pi/sound/` 解析），详见 `ly-pi/my-sound/README.md`。

---

## ⚙️ 配置

所有配置源文件统一放在 `ly-pi/assets/config/`，修改后执行 `bun run deploy` 部署到 `~/.pi/agent/`（不要直接改部署副本）：

| 配置 | 说明 |
|------|------|
| `ly-pi/my-permission/` | 权限规则：确定性规则（`config.ts`）+ 项目级 `JUDGE.md` 模型法官规则 |
| `ly-pi/assets/config/my-tool-display.json` | `my-tool-display` 启用开关、Bash 折叠行数（`bashCollapsedLines`，默认 10）与 diff 折叠行数（`diffCollapsedLines`，默认 24） |
| `ly-pi/assets/config/pi-tool-display-disabled.json` | 旧版 `pi-tool-display` 的禁用兼容配置（效果取决于旧 renderer 是否支持 `enabled` 字段） |
| `ly-pi/assets/config/settings.json` | 子代理模型绑定与 fallback（部署时按 `settings-schema.json` 校验） |
| `ly-pi/assets/config/model-policies.json` | 版本化 Model Manifest：Model Role、候选槽位、能力契约与失败策略；部署时校验并复制到扩展目录 |
| `ly-pi/assets/config/mcp.json` | MCP 服务器配置 |
| `ly-pi/assets/config/my-sound.json` | 音效开关、语音包与分类配置 |
| `ly-pi/assets/config/my-back.json` | `/back` 命令配置 |
| `ly-pi/assets/config/append-system.md` | 追加到系统提示的全局指令 |
| `ly-pi/assets/config/web-search.json` / `rpiv-todo.json` | 第三方扩展配置 |

### 作者个人化内容（使用前请自行调整）

本仓库是作者的个人配置开源，以下内容带有强烈的个人偏好，**作示例用途，按需修改**：

- **`ly-pi/assets/config/settings.json`** 中的模型绑定（如 `kimi-coding`、`deepseek-v4-flash`）是作者自建的 provider/model 别名，你需要替换为自己的模型配置
- **`ly-pi/assets/config/append-system.md`** 中的语言偏好（中文回复等）为作者个人设定
- **`JUDGE.md`、`CONTEXT.md`** 是作者个人项目的权限法官规则与领域术语表
- **`docs/agents/`** 是作者按 Matt Pocock skills 工作流配置的本地 issue tracker 约定
- **`.scratch/`** 是作者本仓库的本地票据，可作为该工作流的实例参考

---

## 💻 日常开发

```bash
# 全量测试（ly-pi 包）
bun run --cwd ly-pi test

# 硬性验收（lint + typecheck + test + check-docs）
bun run verify

# 完整流水线（build → test → deploy all）
bun run deploy
```

快速测试扩展：

```bash
pi -e ly-pi/index.ts
```

### 文档系统

需求与规格由 [mattpocock/skills](https://github.com/mattpocock/skills) 工作流管理，不维护传统的 REQUIREMENTS/SPEC 文档：`/to-spec` 产出到 `.scratch/<feature-slug>/spec.md`，`/to-tickets` 拆票到 `.scratch/<feature-slug>/issues/`。

---

## ❓ FAQ

**Q: 部署后没有音效？**
音效不随仓库分发。确认 `~/.ly-pi/sound/<pack>/` 下有音频文件，且 `my-sound.json` 中 `soundDir` 指向该目录。

**Q: Context7 / Tavily 不工作？**
确认对应环境变量已设置（见「API key」一节），或直接在部署后的 `~/.pi/agent/mcp.json` / `web-search.json` 中填入 key。

**Q: 可以直接用作者的 settings.json 模型配置吗？**
不能直接照搬——`kimi-coding`、`deepseek-v4-flash` 等是作者本地配置的别名。请替换成你自己的 provider 与模型。

**Q: 不想用某个子模块？**
在 `ly-pi/index.ts` 中注释掉对应注册行即可，各子模块相互独立（web-preview / shared 为内部依赖除外）。

---

## 🤝 贡献

1. Fork 并创建特性分支
2. 修改业务逻辑须附带测试（TDD：先写失败测试再实现）
3. 提交前运行 `bun run verify`（lint + typecheck + test + check-docs 四件套必须全过）
4. 提交信息遵循约定式提交：`feat(scope): title`，全英文祈使句

---

## 📄 技术栈

- **TypeScript** + **Bun**（运行时、构建、包管理）
- **Vitest**（测试 + v8 覆盖率）
- **TypeBox**（运行时类型校验）
- **Pi Extension API**（事件、工具、命令、快捷键、Widget）

## License

[MIT](LICENSE) © lychee
