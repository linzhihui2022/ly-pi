# configure 项目需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 本文档作为项目级需求索引，各子组件的详细需求见对应目录下的 `REQUIREMENTS.md` 与 `SPEC.md`。

## 1. 目标

本项目是围绕 [Pi Coding Agent](https://pi.dev) 构建的完整开发环境配置仓库，使用 Turborepo + Bun workspaces 统一管理扩展、技能、主题、子代理、MCP 配置与终端设置。所有 Pi 扩展遵循 TDD 流程，需求文档与代码同步演进。

## 2. 项目范围

```
configure/
├── pi-extensions/          # Pi 自定义扩展（7 个）
├── pi-skills/              # 自定义技能
├── pi-themes/              # 自定义主题
├── pi-agents/              # 子代理定义
├── pi-config/              # 纯配置扩展
├── mcp/                    # MCP 服务器配置
├── settings/               # Pi 设置
├── README.md               # 项目总览
├── AGENTS.md               # 仓库开发指南
├── MY-AGENTS.md            # 全局 Agent 偏好
├── REQUIREMENTS.md         # 本文件：项目级需求索引
├── SPEC.md                 # 项目级架构与流程规格
└── turbo.json              # Turborepo 流水线
```

## 3. 子组件需求清单

### Pi 扩展

| 扩展 | 核心能力 | 需求文档 | 规格文档 |
|------|----------|----------|----------|
| `my-ask` | `ask_user_question` 结构化问答工具 | [REQUIREMENTS](./pi-extensions/my-ask/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-ask/SPEC.md) |
| `my-back` | `/back` 命令回退最近用户消息 | [REQUIREMENTS](./pi-extensions/my-back/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-back/SPEC.md) |
| `my-bt` | BT-7274 语音包与浮层通知 | [REQUIREMENTS](./pi-extensions/my-bt/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-bt/SPEC.md) |
| `my-html` | `/html` 命令将 assistant 回复渲染为 HTML 预览 | [REQUIREMENTS](./pi-extensions/my-html/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-html/SPEC.md) |
| `my-hud` | 三层 HUD 状态栏（aboveEditor / footer / working） | [REQUIREMENTS](./pi-extensions/my-hud/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-hud/SPEC.md) |
| `my-todo` | `todo` / `goal` / `goal_complete` 工具与计划模式 | [REQUIREMENTS](./pi-extensions/my-todo/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-todo/SPEC.md) |
| `my-webtool` | `web_search` / `web_fetch` 网页工具 | [REQUIREMENTS](./pi-extensions/my-webtool/REQUIREMENTS.md) | [SPEC](./pi-extensions/my-webtool/SPEC.md) |

### 技能、主题、子代理与配置

| 组件 | 说明 | 入口 |
|------|------|------|
| `pi-skills` | 6 个仓库自有技能；不保存从外部仓库迁移或镜像的技能副本 | `./pi-skills/` |
| `pi-themes` | Catppuccin Mocha 主题 | `./pi-themes/` |
| `pi-agents` | 13 个 `pi-subagents` 用户级子代理定义（通用角色 8 个、PR 审查角色 5 个） | `./pi-agents/` |
| `pi-config` | 纯配置扩展（权限系统、工具显示） | `./pi-config/` |
| `mcp` | MCP 服务器配置 | `./mcp/` |
| `settings` | `pi-subagents` 模型映射与 fallback | `./settings/` |

## 4. 全局功能需求

### 构建与测试

1. 使用 `bunx turbo run build` 进行增量构建。
2. 使用 `bunx turbo run test` 运行全量测试。
3. 使用 `bunx turbo run build test deploy` 执行完整流水线。
4. 使用 `bun run deploy` 一键部署扩展、技能、主题、设置与 MCP 配置。

### 设置与模型

1. `settings/settings.json` 维护 `pi-subagents` 子代理模型映射与 fallback；同名通用角色的 agent 文件不重复声明 `model`，以确保 `agentOverrides` 生效。
2. Pi 内置模型目录是官方 provider/model 元数据的唯一来源；当前所需 Kimi 模型均已内置，仓库不维护 `settings/models.json`。
3. `bun run deploy` 将设置同步到 `~/.pi/agent/settings.json`，不写入自定义模型配置。
4. Pi 包由 Pi 包管理器单独维护；子代理运行时必须安装 `npm:pi-subagents`，不得同时安装 `npm:@gotgenes/pi-subagents`。

### 子代理管理

1. `pi-agents/*.md` 必须使用 `pi-subagents` frontmatter：显式 `name`，使用 `systemPromptMode`，并按需声明 `inheritProjectContext`、`inheritSkills`、`acceptanceRole` 与 `completionGuard`。
2. 仓库及已部署代理不得残留 `@gotgenes/pi-subagents` 专用字段 `prompt_mode`。
3. 调度文档和技能必须使用 `subagent({ agent, task, ... })`、`tasks`/`chain`、`async`、`subagent_wait` 或 `subagent({ action: ... })`；不得使用 `subagent_type`、`run_in_background`、`get_subagent_result` 或 `steer_subagent`。
4. 保留 `@gotgenes/pi-permission-system`，使用 `pi-subagents` 提供的父子会话桥接完成子代理权限检查。

### 扩展开发规范

1. 每个 Pi 扩展目录下必须包含 `REQUIREMENTS.md`（要什么 / 不做什么）和 `SPEC.md`（设计与实现规格）。
2. 扩展遵循 TDD 流程：先写测试，再写实现，再验证覆盖率。
3. 扩展代码覆盖率要求：`branches / functions / lines / statements` 全部 100%。
4. 覆盖率排除项：`types.ts`（纯类型）、`index.ts`（集成入口）、`RealGitAdapter`（execSync 壳）。
5. JSON 配置文件与扩展目录同级：`pi-extensions/my-xxx.json`；纯配置扩展统一放在 `pi-config/`。
6. 支持通过 `/reload` 热重载扩展。

### 技能管理

1. `pi-skills/skills/` 仅维护 6 个仓库自有技能：`auditing-plan-implementation`、`creating-pull-requests`、`review-pr`、`split-design-into-tickets`、`web-search-researcher`、`writing-plan-for-ticket`。
2. 仓库不保留 `migrate-superpower`、迁移映射/SHA 记录，以及从 `obra/superpowers` 或 `mattpocock/skills` 迁移出的技能副本。
3. 技能部署以仓库目录为唯一来源，必须清除 `~/.pi/agent/skills/` 中已从仓库删除的旧副本。
4. 本次清理不向 `settings/settings.json` 添加官方 Superpowers Pi 包。

### 需求文档同步

1. 任何需求变动必须**先更新文档，再改代码**。
2. 触发条件：用户提出新需求/变更、实现与文档不符、需求范围经讨论发生变化。
3. 更新顺序：先 `REQUIREMENTS.md`，再 `SPEC.md`（若影响设计），最后实现。

## 5. 全局非功能需求

1. 项目使用 TypeScript + Bun + Turborepo + Vitest 技术栈。
2. 使用 TypeBox 做运行时类型校验。
3. 使用 Biome 做代码格式与检查（`bun run format` / `bun run check`）。
4. 提交信息遵循约定式提交：`类型(范围): 描述`。
5. 环境变量安全：禁止使用 `env | grep` 等批量导出方式，只使用 `echo $VAR_NAME` 确认特定变量。

## 6. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 在仓库中维护 API key、token 等敏感配置 | 通过环境变量或外部文件注入，避免泄露 |
| 为 skills / themes / agents 写独立的 REQUIREMENTS.md | 当前以仓库级需求和各目录入口说明为准；如后续复杂度提升再拆分 |
| 在仓库中迁移或镜像第三方技能 | 避免维护迁移规则和外部副本；上游支持 Pi 时使用其原生安装机制 |
| 自维护 Visual Companion 扩展 | 官方 Superpowers 已包含自己的浏览器伴侣实现，避免维护重复工具与运行产物 |
| 跨平台音频/浮层支持 | 当前扩展（如 `my-bt`）仅支持 macOS |
| 远程访问 HTML 预览服务器 | 仅绑定 localhost/127.0.0.1 |
| 多后端搜索 | 当前 `my-webtool` 仅实现 Tavily，接口已预留 |

## 7. 验收标准

1. 每个 Pi 扩展目录下均存在 `REQUIREMENTS.md` 与 `SPEC.md`，且内容一致、编号连续。
2. 项目根目录存在 `REQUIREMENTS.md`（索引）和 `SPEC.md`（架构与流程）。
3. `README.md` 中扩展与技能列表和仓库实际数量一致。
4. 全量测试与构建通过：`bunx turbo run build test` 成功。
5. 仓库与 `~/.pi/agent/skills/` 均只保留上述 6 个技能，不存在迁移工具、迁移记录或外部技能副本。
6. 仓库与本机均不保留 `models.json`；`kimi-coding/k3` 和 `kimi-coding/kimi-for-coding-highspeed` 均使用 Pi 官方定义。
7. `settings/settings.json` 不包含 `git:github.com/obra/superpowers`。
8. 仓库和 `~/.pi/agent/extensions/` 均不存在 `my-visual-companion`，仓库不存在 `.lychee/visual-companion/` 运行产物，权限配置不包含 `visual_companion_*`。
9. `pi list` 包含 `npm:pi-subagents` 且不包含 `npm:@gotgenes/pi-subagents`；`@gotgenes/pi-permission-system` 继续加载。
10. `pi-subagents` 能发现全部 13 个 `pi-agents` 用户级定义，且 `/subagents-doctor` 不报告代理配置或权限桥接错误。
11. `pi-agents/` 与仍在部署的技能中不存在 `prompt_mode`、`subagent_type`、`run_in_background`、`get_subagent_result`、`steer_subagent` 等旧格式。

## 8. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-22 | 子代理运行时从 `@gotgenes/pi-subagents` 迁移至 `pi-subagents`，同步迁移 13 个 agent 定义与调度语法 |
| 2026-07-22 | 移除本地 `my-visual-companion` 扩展、权限配置与历史运行产物，扩展数量调整为 7 |
| 2026-07-22 | 移除技能迁移工具及所有外部迁移副本，仅保留 6 个仓库自有技能；不安装官方 Superpowers 包 |
| 2026-07-21 | 移除重复的 Kimi K3 与 highspeed 自定义定义，统一使用 Pi 官方模型目录 |
| 2026-07-10 | 创建项目级 `REQUIREMENTS.md` 与 `SPEC.md`，统一索引各子组件需求文档 |
