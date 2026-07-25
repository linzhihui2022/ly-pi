# 04 — 重写 README 与 AGENTS.md

**What to build:** README 与 AGENTS.md 反映文档系统的新现实。README：目录树与扩展表格对齐实际目录（移除 pi-preview-server 后回到 5 个扩展）；删除"项目级需求文档见 REQUIREMENTS.md"类指引，替换为一段"文档系统说明"（需求规格由 Matt skills 工作流管理，落在 .scratch/，约定见 docs/agents/）；所有相对链接经 check-docs 校验可解析。AGENTS.md：「需求文档同步」一节替换为「需求与规格工作流」（新需求走 /to-spec → /to-tickets，.scratch/ 纳入 git，文档修正类变更直接改 README/AGENTS.md）；旧 REQUIREMENTS.md 独有的硬性规则（修改业务逻辑必须附带测试、覆盖率 100% 及排除项、环境变量安全等）逐条核对，AGENTS.md 缺失的补入。

**Blocked by:** 03 — 删除旧文档体系与结构碎片（改的是删除后的新现实）

**Status:** resolved

- [x] README 扩展表格与 pi-extensions/ 实际目录一致（check-docs 第 (1) 项通过）
- [x] README 含"文档系统说明"段落，不再引用 REQUIREMENTS/SPEC
- [x] AGENTS.md 不再出现 REQUIREMENTS/SPEC 同步规则，新工作流规则成文
- [x] 旧硬规则在 AGENTS.md 中逐条有覆盖，无丢失
- [x] check-docs 第 (2) 项链接校验通过

## Answer

README：目录树移除 REQUIREMENTS/SPEC、新增 tools/check-docs、docs/agents、.scratch；头部需求文档指引替换为「文档系统」一节（工作流入口、耐久文档、check-docs 防线）。AGENTS.md：「需求文档同步」替换为「需求与规格工作流」（/to-spec → /to-tickets 入口、.scratch 纳入 git、文档修正直接改、check-docs 防线）。旧硬规则核对结果：TDD、覆盖率 100% 及排除项、JSON 配置约定、热重载原有覆盖；Biome、TypeBox、pi-skills 快照部署与禁镜像外部技能、pi-subagents 运行时约束为补入项；提交规范、环境变量安全、bun registry 由全局 MY-AGENTS.md 覆盖。check-docs 5/5 通过。
