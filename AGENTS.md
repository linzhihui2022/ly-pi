# Pi Agent 本地开发指南

## 项目概述

这是一个 pi coding agent 的配置仓库，包含 pi-extensions、自定义技能和主题。使用 **Turborepo + Bun workspaces** 管理扩展的构建、测试和部署。

| 文件/目录 | 说明 |
|-----------|------|
| `MY-AGENTS.md` | 全局偏好（软链接到 `~/.pi/agent/AGENTS.md` 和 `~/.claude/CLAUDE.md`） |
| `pi-extensions/` | 扩展源码（Bun workspaces） |
| `pi-skills/` | 自定义技能 |
| `pi-themes/` | 自定义主题 |
| `turbo.json` | Turborepo 流水线：build → test → deploy |
| `install.sh` | 一键部署（`bun run deploy`） |
| `starship.toml` | Starship 终端提示符 |
| `wezterm.lua` | WezTerm 终端配置 |

## 开发工作流

### 构建、测试、部署

```bash
# 增量构建（缓存，跳过未变更的包）
bunx turbo run build

# 增量测试
bunx turbo run test

# 全量流水线
bunx turbo run build test deploy

# 一键部署（含 skills/themes/settings/mcp）
bun run deploy
```

### 单扩展快速测试

```bash
pi -e pi-extensions/my-bt/index.ts
```

### 单扩展运行测试

```bash
cd pi-extensions/my-hud && bun test
```

### TDD 流程

pi-extensions 遵循 TDD：

```bash
# 全量测试
bunx turbo run test

# 单扩展测试
cd pi-extensions/my-hud && vitest run
```

覆盖率硬性要求：branches/functions/lines/statements 全部 100%。
排除项：types.ts、index.ts（集成测试）、RealGitAdapter（execSync 壳）。

- 先写测试，确认失败
- 再写实现
- 确认通过 + 覆盖率达标
- 部署验证：`bun run deploy` + `/reload`

## 配置规范

- JSON 配置文件与扩展目录同级：`pi-extensions/my-xxx.json`
- 支持热重载（通过 `/reload`）
- 纯配置扩展统一放在 `pi-extensions/pi-config/`

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
