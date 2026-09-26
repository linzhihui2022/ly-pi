# 开源准备

Status: resolved

## Problem Statement

本仓库（pi agent 扩展全家桶：ly-pi 统一入口 + 技能 + 主题 + 子代理 + 配置）在开源前存在三类阻塞项：真实 API key 已进入 git 历史且仍存在于 HEAD；音效资产版权归属不明，不能随仓库分发；以及面向作者本机的工程化缺口（硬编码家目录、README 未开源化、缺少 LICENSE 与 CI）。

## Solution

按优先级完成开源准备：P0 安全与法律（移除并轮换 API key、处置音效版权、添加 LICENSE），P1 工程化（消除硬编码路径、README 开源化改写、package 元数据、依赖许可证核查、声明个人化文件），P2 可选（CI、公开远程）。

## Implementation Decisions

- **API key**：`mcp.json` 改为 `${CONTEXT7_API_KEY}` 插值，`web-search.json` 改走 `TAVILY_API_KEY` 环境变量；两个真实 key 由用户完成轮换。
- **音效**：改为用户自备 —— 读取位置迁移到 `~/.ly-pi/sound/<pack>/`，音频文件移出仓库（git rm + 拷至家目录），README 与 my-sound README 同步更新。
- **LICENSE**：MIT（Copyright (c) 2026 lychee）。
- **硬编码路径**：`config.ts` 改用 `~/.pi/agent`（规则引擎支持 `expandHome`）；两个测试夹具路径改为 `/Users/alice`。
- **README 开源化**：badge、特性、安装（含 API key 与音效自备说明）、FAQ、贡献指南；声明模型绑定与 `append-system.md` 属个人偏好；模块数量统一为 11。
- **package 元数据**：根包与 ly-pi 均补 license/author。
- **个人化文件声明**：README 新增「作者个人化内容」一节，覆盖 `JUDGE.md`、`CONTEXT.md`、`docs/agents/`、`.scratch/`。
- **CI**：`.github/workflows/verify.yml` 在 push/PR 时运行 `bun run verify`。

## Testing Decisions

- 以 `bun run verify`（lint + 两个 typecheck + 全量测试 + check-docs）作为唯一验收门槛，并由 CI 在 push/PR 上执行。
- 依赖许可证核查：typebox / open / marked / marked-highlight / github-markdown-css / pi-* / vitest 为 MIT，highlight.js 为 BSD-3-Clause，biome 为 MIT OR Apache-2.0，native-preview 为 Apache-2.0，全部 permissive 无冲突。
- 入库核查：`.env`、coverage、dist 均被 gitignore 且未入库。

## Out of Scope

- 不做 git 历史清洗（filter-repo）：旧 key 已轮换，历史风险由轮换处置。
- 不迁移或镜像外部技能副本。

## Further Notes

本 spec 于 2026-09 从已完成的票据回溯补写（该 feature 未在开工前产出 spec）。公开远程为 `git@jan24th:linzhihui2022/ly-pi.git`（jan24th 凭证即 linzhihui2022 账号）；`Lychee-rb2/ly-pi` 已删除。
