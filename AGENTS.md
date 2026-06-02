# Pi Agent 本地开发指南

## 项目概述

这是一个 pi coding agent 的配置仓库，包含 pi-extensions、自定义技能和主题。

| 文件/目录 | 说明 |
|-----------|------|
| `MY-AGENTS.md` | 全局偏好（软链接到 `~/.pi/agent/AGENTS.md` 和 `~/.claude/CLAUDE.md`） |
| `pi-extensions/` | 扩展源码 |
| `pi-skills/` | 自定义技能 |
| `pi-themes/` | 自定义主题 |
| `install.sh` | 将扩展、技能、主题部署到 `~/.pi/agent/` |
| `starship.toml` | Starship 终端提示符 |
| `wezterm.lua` | WezTerm 终端配置 |

## pi-extensions

## 开发工作流

### 快速测试（推荐）

**pi-extensions** — 用 `-e` 直接加载单个文件：

```bash
pi -e pi-extensions/my-bt/index.ts
```

### 完整部署（pi-extensions）

```bash
./install.sh
```

将 `pi-extensions/` 下所有内容复制到 `~/.pi/agent/extensions/`。启动 pi 后修改源码并执行 `/reload` 即可热重载。

> 之前 `extensions` 目录是软链接，开发时修改会实时影响运行中的 pi。改为 `install.sh` 后，开发和运行环境隔离，需要显式部署。

### TDD 流程

pi-extensions 遵循 TDD：

```bash

# pi-extensions 测试
npx vitest run pi-extensions/
```

覆盖率硬性要求：branches/functions/lines/statements 全部 100%。
排除项：types.ts、index.ts（集成测试）、RealGitAdapter（execSync 壳）。

- 先写测试，确认失败
- 再写实现
- 确认通过 + 覆盖率达标
- pi-extensions：部署验证用 `./install.sh` + `/reload`

## 配置规范

- JSON 配置文件与扩展目录同级：`pi-extensions/my-xxx.json`
- 支持热重载（通过 `/reload`）

### 需求文档同步

项目中若存在 `SPEC.md` 和 `REQUIREMENTS.md`（或同级/同目录下的规格与需求文件），**任何需求变动都必须先更新文档，再改代码**。

触发条件：

- 用户主动提出新需求或变更现有需求
- 实现过程中发现需求与文档不符，需要调整
- 讨论后确认需求范围发生变化

执行顺序：

1. 发现需求变动 → 立即停下手头编码
2. 更新 `REQUIREMENTS.md`（「要什么 / 不做什么」清单）
3. 若变动影响设计决策或模块职责，同步更新 `SPEC.md`
4. 请用户确认（或至少通读确认无误）
5. 确认后再继续实现

不允许：先改代码，事后补文档。
