# Pi Agent 本地开发指南

## 项目概述

这是一个 pi coding agent 的配置仓库，包含 ly-pi 统一扩展入口、自定义技能和主题。使用 **Bun workspaces** 管理多包构建、测试和部署。

| 文件/目录 | 说明 |
|-----------|------|
| `MY-AGENTS.md` | 全局偏好（软链接到 `~/.pi/agent/AGENTS.md` 和 `~/.claude/CLAUDE.md`） |
| `ly-pi/` | 统一扩展入口（单包，含全部 9 个子模块） |
| `pi-skills/` | 自定义技能 |
| `pi-themes/` | 自定义主题 |
| `scripts/deploy-all.ts` | 统一部署流水线（build → test → deploy all） |
| `install.sh` | 一键部署（`bun run deploy`） |
| `starship.toml` | Starship 终端提示符 |
| `wezterm.lua` | WezTerm 终端配置 |

## 开发工作流

### 构建、测试、部署

```bash
# 构建
bun run --cwd ly-pi build

# 测试（含覆盖率）
bun run --cwd ly-pi test

# 一键部署（ly-pi + skills + themes + settings）
bun run deploy
```

### 快速测试

```bash
pi -e ly-pi/index.ts
```

### TDD 流程

ly-pi 遵循 TDD：

```bash
# 全量测试
bun run --cwd ly-pi test

# 单模块测试
bun run --cwd ly-pi test -- my-hud
```

覆盖率硬性要求：branches/functions/lines/statements 全部 100%。
排除项：types.ts、index.ts（集成测试）。

- 先写测试，确认失败
- 再写实现
- 确认通过 + 覆盖率达标
- 部署验证：`bun run deploy` + `/reload`

## 配置规范

- **修改 pi 配置时，先查本项目是否有源文件**。许多 pi 配置（settings.json、扩展配置等）的源文件在 `ly-pi/assets/config/` 下，通过 `bun run deploy` 部署到 `~/.pi/agent/`。修改时应改源文件再 deploy，不要直接改 `~/.pi/agent/` 下的部署副本。
- JSON 配置文件放在扩展包根目录（如 `ly-pi/my-sound.json`），用 `EXT_DIR` 解析加载，部署脚本随 `index.js` 一并拷贝
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
- 一致性防线：`bun run check-docs` 校验文档与仓库现实对齐（README 扩展表、相对链接、`.scratch/` 票据约定、旧体系文件复活）

## 一致性约束

**硬性规则：完成任何工作后，必须运行 `bun run check-docs` 验证文档与代码的一致性。** 检查未通过不得视为工作完成。

- 修改了 README、AGENTS.md、或任何 `docs/` 下的耐久文档 → 跑 check-docs
- 新增/删除/重命名文件或目录 → 跑 check-docs
- 修改了 `.scratch/` 下的票据或规格 → 跑 check-docs
- 即使以上都不适用，在工作结束前也应跑一次作为兜底验证

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
