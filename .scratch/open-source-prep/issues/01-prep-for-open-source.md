# 01 — 开源准备（open-source prep）

**What to build:** 将本仓库（pi agent 扩展全家桶：ly-pi 统一入口 + 技能 + 主题 + 子代理 + 配置）开源到公开仓库前的准备工作。现状调查已完成（见 `## Comments`），以下工作项按优先级排列。

**Blocked by:** None — can start immediately

**Status:** needs-triage

## 工作项

### P0 安全与法律

- [ ] **移除并轮换 API key**：`ly-pi/assets/config/mcp.json` 内嵌真实 Context7 key（`ctx7sk-...`）、`ly-pi/assets/config/web-search.json` 内嵌真实 Tavily key（`tvly-dev-...`），且均已进入 git 历史。改占位符 + 文档说明从环境变量/用户自填读取；**用户需在 Context7 / Tavily 后台轮换这两个 key**（human）
- [ ] **音效版权处置**：`ly-pi/assets/sounds/` 20 个 wav 被 tracked，bt-7274（《泰坦陨落 2》角色语音）与 minions（小黄人）语音受版权保护，不可随仓库分发。处置方式待用户决策：移除 / 替换 CC0 / 改为文档说明用户自备（human）
- [ ] **添加 LICENSE**：当前仓库无 LICENSE 文件，需选择许可证（建议 MIT）（human）

### P1 工程化

- [ ] **消除 `/Users/lychee` 硬编码**：`ly-pi/my-permission/config.ts:82` 的 `external_directory` allow 规则写死家目录，改为 `$HOME` 通配或配置化（agent）
- [ ] **README 开源化改写**：从"我的全家桶"视角改为项目文档——简介、特性、安装、配置、FAQ、贡献指南、license badge；说明 `settings.json` 模型绑定（kimi-coding / deepseek-v4-flash）与 `append-system.md` 语言偏好为作者个人配置，用户需自行调整（agent）
- [ ] **package.json 元数据**：补充 repository / license / author 字段（`private: true` 可保留，不发布 npm）（agent）
- [ ] **声明个人化文件**：README 注明 `JUDGE.md`、`CONTEXT.md`、`docs/agents/` 为作者个人权限规则与术语表，开源作示例，用户按需修改（agent）
- [ ] **依赖许可证核查**：pi-subagents、pi-mcp-adapter、TypeBox 等依赖 license 确认无冲突（agent）

### P2 可选

- [ ] **CI**：GitHub Actions 跑 `bun run verify`（lint + typecheck + test + check-docs）（agent）
- [ ] **历史清洗或新远程**：当前 remote 为私有服务器 `git@jan24th:...`；若公开到 GitHub，建议新开仓库 push；需先处理 P0 的 key 历史（可用 `git filter-repo` 清洗，会重写全部 commit hash）（human）

## Comments

2026-08-17 调查结论（agent）：README 与测试已较完善，`.env` / coverage / dist 均被 gitignore 且未入库；git 历史中未发现 `.env` / 私钥类文件，但两个真实 API key 自 `a2c5857` 起存在于历史且当前 HEAD 仍在。README 模块数量表述不一致：摘要与 AGENTS.md 写"10 个扩展"，实际 `ly-pi` 下为 11 个子模块（目录树与表格均列 11），需在改写 README 时统一。
