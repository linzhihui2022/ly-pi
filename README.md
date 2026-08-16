# configure

我的终端、Shell、AI 编码 Agent 全家桶 —— Git 版本管理，一键部署。

> 围绕 [Pi Coding Agent](https://pi.dev) 构建的完整开发环境，所有 10 个 Pi 扩展合并为统一入口 `ly-pi`，扩展代码与配置、技能、主题、子代理、音效统一收纳在 `ly-pi/assets/` 随部署分发；含 5 个 PR 审查子代理定义（通用角色由 `pi-subagents` 官方包提供）、Catppuccin Mocha 主题等。

> 需求与规格的管理方式见下文「文档系统」一节。

---

## 目录结构

```
configure/
├── ly-pi/                    # 统一扩展入口（单包，含全部 11 个子模块）
│   ├── index.ts              # 入口：按序注册所有子模块
│   ├── my-cd-guard/          # 冗余 cd 前缀自动纠正
│   ├── my-script-guard/      # 内联脚本硬拦截 + 急迫升级
│   ├── my-log/               # 开发日志：/ly-log 命令 + 浏览器查看
│   ├── my-permission/        # 工具调用权限拦截器 + 模型法官
│   ├── my-reload/            # 扩展热重载自动恢复
│   ├── my-back/              # /back 命令
│   ├── my-html/              # /html 渲染
│   ├── my-sound/             # 音效反馈 + 语音包管理
│   ├── my-hud/               # 自定义 HUD 状态栏
│   ├── my-vision/            # 按模型视觉能力注入图片处理规则
│   ├── my-zen/               # 内置工具禅模式渲染（self-shell，/zen 开关）
│   ├── web-preview/          # 内部工具库：HTML 预览 server + 文档骨架
│   ├── shared/               # 跨模块共享（guard-harness 等）
│   ├── assets/               # 部署资产（随 bun run deploy 分发到 ~/.pi/agent/）
│   │   ├── config/           # 纯配置源文件：settings、mcp、tool-display、sound 等
│   │   ├── skills/           # 仓库自有技能（review-pr）
│   │   ├── themes/           # Catppuccin Mocha 主题
│   │   ├── agents/           # 子代理定义（5 个 PR 审查角色 + image-reader）
│   │   └── sounds/           # BT-7274 音效包
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
| **my-log** | 开发日志：`/ly-log on|off` 开关 + `/ly-log` 浏览器查看会话日志，供其他模块通过 `createDevLogger` 接入 |
| **my-permission** | 工具调用权限拦截器：确定性规则 + `deepseek-v4-flash` 模型法官 + 子代理差异化处理 |
| **my-reload** | 扩展热重载自动恢复：`request_reload` 工具标记后，reload 完成自动发送继续指令 |
| **my-back** | `/back` 命令：撤销最近一条用户消息并将文本放回编辑器 |
| **my-html** | `/html` 命令：将助手回复渲染为 Markdown HTML，浏览器中预览 |
| **my-sound** | 音效反馈 + 语音包管理：会话/工具事件触发音频，`/sound` 命令控制，支持多语音包切换 |
| **my-hud** | 自定义单行状态栏：项目名、模型、Git 分支、上下文窗口百分比（颜色阈值）、Token 用量与成本 |
| **my-vision** | 按当前模型视觉能力逐轮注入图片处理规则：视觉模型直接 `read` 读图，非视觉模型委托 `image-reader` 子代理 |
| **my-zen** | 禅模式渲染：内置工具（read/bash/edit/write/grep/find/ls）用 `renderShell: "self"` 去掉外壳 padding，执行中一行 dim 摘要、完成后 0 行隐形；错误与非零退出码单行红色提示，`ctrl+o` 展开全文。user 消息 patch `rebuild` 强制零垂直 padding（保留原生整行背景色条与左右边距，与 pi-tool-display 的 render patch 无冲突）。`/zen` 切换开关，`/zen off` 交还 pi-tool-display（自动改写双方配置并 reload） |

---

## 🎯 技能

- **仓库自有**（`ly-pi/assets/skills/`，随 deploy 快照式部署）：`review-pr` — 并行调度专职 reviewer 子代理做多维度 PR 审查
- **由 [mattpocock/skills](https://github.com/mattpocock/skills) 工作流提供**（外部安装，不镜像到本仓库），驱动「需求与规格」流程：

| 技能 | 用途 |
|------|------|
| auditing-plan-implementation | 审计实现是否符合计划、票据或设计文档 |
| creating-pull-requests | 创建 GitHub pull request 时整理描述与验证步骤 |
| split-design-into-tickets | 将设计文档拆分为可执行票据 |
| web-search-researcher | 检索训练数据之外的最新信息 |
| writing-plan-for-ticket | 将 Linear 风格票据转换为实施计划 |

---

## 🎨 主题

- **Catppuccin Mocha** — 深色主题，完整覆盖 TUI 元素（用户消息、工具状态、Markdown、语法高亮、差异视图、思考模式等）。源文件在 `ly-pi/assets/themes/catppuccin-mocha.json`，部署到 `~/.pi/agent/themes/`。

---

## 🤖 子代理

运行时使用 [`pi-subagents`](https://pi.dev/packages/pi-subagents)。通用角色（scout、delegate、researcher、context-builder、planner、oracle、reviewer、worker）由 `pi-subagents` 官方包提供；`ly-pi/assets/agents/*.md` 只保留 5 个 PR 审查角色（另有 `image-reader` 供 my-vision 委托非视觉模型读图），部署到 `~/.pi/agent/agents/`。通用角色的模型与 fallback 由 `ly-pi/assets/config/settings.json` 统一覆盖。

| 子代理 | 模型 | 用途 |
|--------|------|------|
| pr-code-reviewer | kimi-for-coding | PR 通用代码审查：项目规范、bug 检测、代码质量 |
| pr-comment-analyzer | deepseek-v4-flash | PR 注释与文档审查：准确性、完整性、可维护性 |
| pr-silent-failure-hunter | kimi-for-coding | PR 静默失败审查：错误处理、fallback、异常抑制 |
| pr-test-analyzer | kimi-for-coding | PR 测试覆盖审查：质量、完整性、行为覆盖 |
| pr-type-design-analyzer | kimi-k2-thinking | PR 类型设计审查：封装、不变量、类型表达 |

---

## ⚙️ 纯配置

所有配置源文件统一放在 `ly-pi/assets/config/`，修改后执行 `bun run deploy` 部署到 `~/.pi/agent/`（不要直接改部署副本）：

| 配置 | 说明 |
|------|------|
| `ly-pi/my-permission/` | 权限规则：确定性规则（`config.ts`）+ 项目级 `JUDGE.md` 模型法官规则 |
| `assets/config/pi-tool-display.json` | pi-tool-display 配置：registerToolOverrides 与 enableNativeUserMessageBox 已关闭（工具与 user 消息渲染由 my-zen 接管），保留 MCP 输出隐藏等功能 |
| `assets/config/settings.json` | 子代理模型绑定与 fallback（部署时按 `settings-schema.json` 校验） |
| `assets/config/mcp.json` | MCP 服务器配置（Chrome DevTools、Notion、Linear 等） |
| `assets/config/my-sound.json` | 音效开关、语音包与分类配置 |
| `assets/config/my-zen.json` | my-zen 禅模式开关（`on` / `off` 交还 pi-tool-display） |
| `assets/config/my-back.json` | `/back` 命令配置 |
| `assets/config/append-system.md` | 追加到系统提示的全局指令 |
| `assets/config/web-search.json` / `rpiv-todo.json` | 第三方扩展配置 |

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
ln -sf "$REPO/MY-AGENTS.md" ~/.dsh/AGENTS.md

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
