# configure

我的终端、Shell、AI 编码 Agent 全家桶 —— Git 版本管理，一键部署。

> 围绕 [Pi Coding Agent](https://pi.dev) 构建的完整开发环境，包含 9 个自定义扩展、15 个技能、8 个子代理定义、Catppuccin Mocha 主题等。

项目级需求文档见 [`REQUIREMENTS.md`](./REQUIREMENTS.md)，架构与流程规格见 [`SPEC.md`](./SPEC.md)。

---

## 目录结构

```
configure/
├── pi-extensions/          # Pi 自定义扩展（Bun workspaces, 9 个）
├── pi-skills/skills/       # 自定义技能（15 个）
├── pi-themes/              # 自定义主题（Catppuccin Mocha）
├── pi-agents/              # 子代理定义（8 个）
├── pi-config/              # 纯配置扩展（权限系统、工具显示）
├── mcp/                    # MCP 服务器配置
├── settings/               # Pi 设置（子代理模型映射）
│
├── starship.toml           # Starship 终端提示符
├── wezterm.lua             # WezTerm 终端配置
├── MY-AGENTS.md            # 全局 Agent 指令 → ~/.pi/agent/AGENTS.md
├── AGENTS.md               # configure 仓库自身的开发指南
├── REQUIREMENTS.md         # 项目级需求索引
├── SPEC.md                 # 项目级架构与流程规格
├── turbo.json              # Turborepo 流水线（build → test → deploy）
├── install.sh              # 一键部署入口
└── package.json            # Monorepo 根配置
```

---

## 🧩 Pi 扩展

| 扩展 | 功能 |
|------|------|
| **my-ask** | `ask_user_question` 工具：向用户发起结构化问答（最多 4 题，支持单选/多选/预览） |
| **my-back** | `/back` 命令：撤销最近一条用户消息并将文本放回编辑器 |
| **my-bt** | BT-7274 语音包：会话生命周期事件触发音频，TUI 浮层展示文案，`/bt` 命令控制 |
| **my-html** | `/html` 命令：将助手回复渲染为 Markdown HTML，浏览器中预览 |
| **my-hud** | 自定义单行状态栏：项目名、模型、Git 分支、上下文窗口百分比（颜色阈值）、Token 用量与成本 |
| **my-todo** | 任务 + 目标追踪：`todo` + `goal` 工具，Plan 模式（规划/执行两阶段），TUI 浮层，自动继续 |
| **my-visual-companion** | 浏览器可视化伴侣：WebSocket 驱动 HTML 界面，支持交互式确认 |
| **my-webtool** | 网页搜索与抓取：Tavily API 的 `web_search` / `web_fetch`，自定义 TUI 渲染 |
| **pi-pet** | 虚拟 ASCII 宠物：状态随时间衰减，`/pet` 命令喂食/玩耍/睡觉/重命名 |

---

## 🎯 技能

| 技能 | 用途 |
|------|------|
| brainstorming | 创造性工作前探索需求与设计 |
| dispatching-parallel-agents | 并行调度 2+ 个独立任务 |
| executing-plans | 按计划逐步执行并设审查点 |
| finishing-a-development-branch | 完成开发后选择合并/PR/清理 |
| grill-me | 压力测试计划、设计、架构 |
| migrate-superpower | 从 Claude Code / Superpowers 迁移到 Pi |
| receiving-code-review | 收到审查反馈后严谨验证再修改 |
| requesting-code-review | 完成任务后请求代码审查 |
| subagent-driven-development | 使用子代理并行执行计划 |
| test-driven-development | 先写测试再实现（TDD） |
| using-superpowers | 建立技能查找与调用机制 |
| verification-before-completion | 声明完成前必须验证通过 |
| web-search-researcher | 检索训练数据之外的最新信息 |
| writing-plans | 多步骤任务前编写实施计划 |
| writing-skills | 创建或编辑技能文件 |

---

## 🎨 主题

- **Catppuccin Mocha** — 深色主题，完整覆盖 TUI 元素（用户消息、工具状态、Markdown、语法高亮、差异视图、思考模式等）

---

## 🤖 子代理

| 子代理 | 模型 | 用途 |
|--------|------|------|
| scout | deepseek-v4-flash | 快速侦察：搜集文件、搜索模式、diff |
| delegate | deepseek-v4-flash | 轻量通用任务（可读写） |
| researcher | kimi-k2-thinking | 网络调研：查找最新信息（可扩展） |
| context-builder | kimi-k2-thinking | 上下文打包：总结代码库信息（只读） |
| planner | kimi-k2-thinking | 设计规划：输出实施计划（只读） |
| oracle | kimi-k2-thinking | 深度推理：第二意见、复杂分析（只读） |
| worker | kimi-for-coding | 实现编码：写代码、修复 bug、TDD |
| reviewer | kimi-for-coding | 代码审查：结构化审查报告（只读） |

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

# 创建符号链接
ln -sf "$REPO/starship.toml" ~/.config/starship.toml
ln -sf "$REPO/wezterm.lua" ~/.wezterm.lua
ln -sf "$REPO/MY-AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sf "$REPO/MY-AGENTS.md" ~/.claude/CLAUDE.md

# 部署扩展、技能、主题、设置、MCP
"$REPO/install.sh"
```

## 💻 日常开发

```bash
# 全量构建
bunx turbo run build

# 全量测试（覆盖率 100% 要求）
bunx turbo run test

# 完整流水线（build → test → deploy）
bunx turbo run build test deploy

# 一键部署
bun run deploy
```

快速测试单个扩展：
```bash
pi -e pi-extensions/my-hud/index.ts
```

> 详见 `AGENTS.md`（完整开发规范：TDD 流程、Git 提交规范、环境变量安全、覆盖率要求等）

---

## 📄 技术栈

- **TypeScript** + **Bun**（运行时、构建、包管理）
- **Turborepo**（Monorepo 编排，增量缓存）
- **Vitest**（测试 + v8 覆盖率）
- **TypeBox**（运行时类型校验）
- **Pi Extension API**（事件、工具、命令、快捷键、Widget）
