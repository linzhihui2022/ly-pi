# configure

我的终端、Shell、AI 编码 Agent 全家桶 —— Git 版本管理，一键部署。

> 围绕 [Pi Coding Agent](https://pi.dev) 构建的完整开发环境，所有 7 个 Pi 扩展合并为统一入口 `ly-pi`，包含 6 个技能、5 个 PR 审查子代理定义（通用角色由 `pi-subagents` 官方包提供）、Catppuccin Mocha 主题等。

> 需求与规格的管理方式见下文「文档系统」一节。

---

## 目录结构

```
configure/
├── ly-pi/                  # 统一扩展入口（单包，含全部 7 个子模块）
│   ├── index.ts            # 入口：按序注册所有子模块
│   ├── my-cd-guard/        # 冗余 cd 前缀自动纠正
│   ├── my-script-guard/    # 内联脚本硬拦截 + 急迫升级
│   ├── my-permission/      # 工具调用权限拦截器 + 模型法官
│   ├── my-back/            # /back 命令
│   ├── my-html/            # /html 渲染
│   ├── my-bt/              # BT-7274 语音包
│   ├── my-hud/             # 自定义 HUD 状态栏
│   └── web-preview/        # 内部工具库：HTML 预览 server + 文档骨架
├── pi-config/              # 纯配置扩展（权限规则、工具显示、子代理配置）
├── pi-skills/skills/       # 自定义技能（6 个）
├── pi-themes/              # 自定义主题（Catppuccin Mocha）
├── pi-agents/              # 子代理定义（5 个 PR 审查角色）
├── mcp/                    # MCP 服务器配置
├── settings/               # Pi 设置（子代理模型映射）
├── tools/check-docs/       # 文档一致性校验
├── docs/agents/            # Matt skills 配置（issue tracker、标签、domain docs）
├── .scratch/               # 本地 issue tracker：需求规格与票据
│
├── scripts/
│   └── deploy-all.ts       # 统一部署脚本（build → test → deploy）
├── starship.toml           # Starship 终端提示符
├── wezterm.lua             # WezTerm 终端配置
├── MY-AGENTS.md            # 全局 Agent 指令 → ~/.pi/agent/AGENTS.md
├── AGENTS.md               # configure 仓库自身的开发指南
├── install.sh              # 一键部署入口
└── package.json            # Monorepo 根配置
```

---

## 📚 文档系统

本仓库的需求与规格由 [mattpocock/skills](https://github.com/mattpocock/skills) 工作流管理，不维护传统的 REQUIREMENTS/SPEC 文档：

- **需求规格**：`/to-spec` 产出到 `.scratch/<feature-slug>/spec.md`，`/to-tickets` 拆票到 `.scratch/<feature-slug>/issues/`
- **耐久文档**：`README.md`（本文件）、`AGENTS.md` / `MY-AGENTS.md`（开发规范）、`docs/agents/`（skill 配置）
- **一致性防线**：`bun run check-docs` 校验文档与仓库现实对齐

---

## 🧩 Pi 扩展（统一入口 `ly-pi`）

所有扩展合并为单一 `ly-pi` 包，一个 `index.ts` 按序注册全部子模块，部署到 `~/.pi/agent/extensions/ly-pi/`，由 Pi 自动发现加载。

| 子模块 | 功能 |
|--------|------|
| **my-cd-guard** | 冗余 cd 前缀自动纠正：原地剥掉指向会话工作目录的 `cd <cwd> &&` 前缀并通知用户 |
| **my-script-guard** | 内联脚本 + 写文件旁路硬拦截：拦截 bash 中的 `-c`/`-e`/heredoc 长脚本，被拦 3 次后升级为用户确认 |
| **my-permission** | 工具调用权限拦截器：确定性规则 + `deepseek-v4-flash` 模型法官 + 子代理差异化处理 |
| **my-back** | `/back` 命令：撤销最近一条用户消息并将文本放回编辑器 |
| **my-html** | `/html` 命令：将助手回复渲染为 Markdown HTML，浏览器中预览 |
| **my-bt** | BT-7274 语音包：会话生命周期事件触发音频，`/bt` 命令控制 |
| **my-hud** | 自定义单行状态栏：项目名、模型、Git 分支、上下文窗口百分比（颜色阈值）、Token 用量与成本 |

---

## 🎯 技能

| 技能 | 用途 |
|------|------|
| auditing-plan-implementation | 审计实现是否符合计划、票据或设计文档 |
| creating-pull-requests | 创建 GitHub pull request 时整理描述与验证步骤 |
| review-pr | 对 PR diff 做多维度代码审查 |
| split-design-into-tickets | 将设计文档拆分为可执行票据 |
| web-search-researcher | 检索训练数据之外的最新信息 |
| writing-plan-for-ticket | 将 Linear 风格票据转换为实施计划 |

---

## 🎨 主题

- **Catppuccin Mocha** — 深色主题，完整覆盖 TUI 元素（用户消息、工具状态、Markdown、语法高亮、差异视图、思考模式等）

---

## 🤖 子代理

运行时使用 [`pi-subagents`](https://pi.dev/packages/pi-subagents)。通用角色（scout、delegate、researcher、context-builder、planner、oracle、reviewer、worker）由 `pi-subagents` 官方包提供；`pi-agents/*.md` 只保留 5 个 PR 审查角色，采用其 agent frontmatter 并部署到 `~/.pi/agent/agents/`。通用角色的模型与 fallback 由 `settings/settings.json` 统一覆盖。

| 子代理 | 模型 | 用途 |
|--------|------|------|
| pr-code-reviewer | kimi-for-coding | PR 通用代码审查：项目规范、bug 检测、代码质量 |
| pr-comment-analyzer | deepseek-v4-flash | PR 注释与文档审查：准确性、完整性、可维护性 |
| pr-silent-failure-hunter | kimi-for-coding | PR 静默失败审查：错误处理、fallback、异常抑制 |
| pr-test-analyzer | kimi-for-coding | PR 测试覆盖审查：质量、完整性、行为覆盖 |
| pr-type-design-analyzer | kimi-k2-thinking | PR 类型设计审查：封装、不变量、类型表达 |

---

## ⚙️ 纯配置

| 配置 | 说明 |
|------|------|
| `pi-config/pi-permission-system.json` | 权限规则：`env`/`.env` 禁止、bash 命令分类控制 |
| `pi-config/pi-tool-display.json` | 工具显示：read/grep/bash 输出模式、diff 风格 |
| `settings/settings.json` | 子代理模型绑定与 fallback |
| `mcp/mcp.json` | MCP 服务器配置（Chrome DevTools、Notion、Linear 等） |

---

## 🚀 首次设置

```bash
REPO="$HOME/Documents/configure"

# 安装依赖
cd "$REPO" && bun install

# 安装子代理运行时
pi install npm:pi-subagents

# 创建符号链接
ln -sf "$REPO/starship.toml" ~/.config/starship.toml
ln -sf "$REPO/wezterm.lua" ~/.wezterm.lua
ln -sf "$REPO/MY-AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$REPO/MY-AGENTS.md" ~/.claude/CLAUDE.md

# 部署扩展、技能、主题、子代理、设置、MCP
"$REPO/install.sh"
```

从旧运行时迁移时先移除冲突包，再安装新包：

```bash
pi remove npm:@gotgenes/pi-subagents
pi install npm:pi-subagents
```

## 💻 日常开发

```bash
# 全量测试（ly-pi 包）
bun run --cwd ly-pi test

# 完整流水线（build → test → deploy all）
bun run deploy
```

快速测试扩展：
```bash
pi -e ly-pi/index.ts
```

---

## 📄 技术栈

- **TypeScript** + **Bun**（运行时、构建、包管理）
- **Vitest**（测试 + v8 覆盖率）
- **TypeBox**（运行时类型校验）
- **Pi Extension API**（事件、工具、命令、快捷键、Widget）
