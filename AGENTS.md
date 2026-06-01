# Pi Agent 本地开发指南

## 项目概述

这是一个 pi coding agent 的配置仓库，包含 pi-extensions、自定义技能和主题。

| 文件/目录 | 说明 |
|-----------|------|
| `MY-AGENTS.md` | 全局偏好（软链接到 `~/.pi/agent/AGENTS.md` 和 `~/.claude/CLAUDE.md`） |
| `pi-extensions/` | 过渡期扩展源码（正在被 pi-infra 替换） |
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
