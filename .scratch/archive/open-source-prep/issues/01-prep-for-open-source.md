# 01 — 开源准备（open-source prep）

**What to build:** 将本仓库（pi agent 扩展全家桶：ly-pi 统一入口 + 技能 + 主题 + 子代理 + 配置）开源到公开仓库前的准备工作。现状调查已完成（见 `## Comments`），以下工作项按优先级排列。

**Blocked by:** None — can start immediately

**Status:** resolved

## 工作项

### P0 安全与法律

- [x] **移除并轮换 API key**：agent 已完成占位符替换（`mcp.json` 改 `${CONTEXT7_API_KEY}` 插值，`web-search.json` 改走 `TAVILY_API_KEY` 环境变量）；human 已完成两个 key 的轮换与环境变量配置（2026-08-17 确认）
- [x] **音效版权处置**：决策：改为用户自备——读取位置迁移到 `~/.ly-pi/sound/<pack>/`，文件移出仓库（已 git rm 并拷贝到家目录），README 与 my-sound README 已更新
- [x] **添加 LICENSE**：MIT（已添加 `LICENSE`，Copyright (c) 2026 lychee）

### P1 工程化

- [x] **消除 `/Users/lychee` 硬编码**：`config.ts` 改为 `~/.pi/agent`（规则引擎支持 expandHome）；另将两个测试夹具路径改为 `/Users/alice`
- [x] **README 开源化改写**：已完成——badge、特性、安装（含 API key 与音效自备说明）、FAQ、贡献指南；模型绑定与 append-system.md 个人偏好已声明；模块数量统一为 11
- [x] **package.json 元数据**：根包与 ly-pi 均补 license/author；repository 字段待公开远程确定后补
- [x] **声明个人化文件**：README「作者个人化内容」一节已覆盖 JUDGE.md、CONTEXT.md、docs/agents/、.scratch/
- [x] **依赖许可证核查**：全部 permissive 无冲突——typebox/open/marked/marked-highlight/github-markdown-css/pi-* /vitest 为 MIT，highlight.js BSD-3-Clause，biome MIT OR Apache-2.0，native-preview Apache-2.0

### P2 可选

- [x] **CI**：`.github/workflows/verify.yml` 跑 `bun run verify`（push/PR 触发），首个 run 已通过
- [x] **新远程**：开源仓库归 linzhihui2022 所有——[Lychee-rb2/ly-pi 已删除](用户操作)，改为 `git@jan24th:linzhihui2022/ly-pi.git` 作为主仓库（jan24th 凭证即 linzhihui2022 账号）。旧 key 已轮换，历史风险已控，未做 filter-repo 清洗

## Comments

2026-08-17 调查结论（agent）：README 与测试已较完善，`.env` / coverage / dist 均被 gitignore 且未入库；git 历史中未发现 `.env` / 私钥类文件，但两个真实 API key 自 `a2c5857` 起存在于历史且当前 HEAD 仍在。README 模块数量表述不一致：摘要与 AGENTS.md 写"10 个扩展"，实际 `ly-pi` 下为 11 个子模块（目录树与表格均列 11），需在改写 README 时统一。

2026-08-17 进展（agent）：P0/P1 的 agent 可完成项全部完成（见勾选）。

2026-08-17 收尾（human + agent）：两个 key 已轮换并配置环境变量；旧音效部署副本已删；deploy 验证通过。P2 完成：CI 首个 run 通过；公开仓库 Lychee-rb2/ly-pi 已建并推送。本票全部工作项关闭。
