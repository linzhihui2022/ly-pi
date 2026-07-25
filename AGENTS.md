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
- 纯配置扩展统一放在 `pi-config/`
- 扩展运行时使用 TypeBox 做类型校验
- 格式与 lint 使用 Biome：`bun run format` / `bun run check`
- `pi-skills/skills/` 仅维护仓库自有技能，不镜像或迁移外部技能副本；部署为快照式，会清除本机已删除的旧副本
- 子代理运行时为 `npm:pi-subagents`，不得与 `npm:@gotgenes/pi-subagents` 并装；`pi-agents/` 仅保留 5 个 PR 审查角色，通用角色由官方包提供
- `pi-themes/scripts/deploy.ts` 只部署 `*.json` 主题文件，排除 `package.json`（Pi 会把目录下所有 `.json` 当主题加载，非主题文件会导致校验错误）

### 需求与规格工作流

本仓库的需求与规格由 Matt Pocock skills 工作流管理，**不再维护 `REQUIREMENTS.md` / `SPEC.md`**（2026-07 废除，历史内容见 git）。

- 新需求：先跑 `/to-spec` 产出规格到 `.scratch/<feature-slug>/spec.md`，经用户确认后 `/to-tickets` 拆票到 `.scratch/<feature-slug>/issues/`
- 票据约定（`NN-slug` 编号、`Status:` 行、认领/解决流程）见 `docs/agents/issue-tracker.md`
- `.scratch/` 纳入 git，即本仓库的本地 issue tracker
- 文档修正类变更（README、AGENTS.md 等耐久文档的内容更新）直接修改，不需要走 spec
- 一致性防线：`bun run check-docs` 校验文档与仓库现实对齐（README 扩展表、相对链接、`.scratch/` 票据约定、旧体系文件复活），turbo `test` 流水线强制执行

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
