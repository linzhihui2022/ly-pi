# 文档系统重建：全面转向 .scratch 工作流

Status: ready-for-agent

## Problem Statement

仓库的文档体系目前处于"两套系统并存"的割裂状态：

1. **旧体系**：根级 `REQUIREMENTS.md` + `SPEC.md`，加上每个扩展各自的 `REQUIREMENTS.md` + `SPEC.md`。AGENTS.md 规定"任何需求变动必须先更新这两个文档再改代码"。
2. **新体系**：Matt Pocock skills 工作流（`/to-spec` → `/to-tickets` → `/triage` → `/implement`），规格和票据落在 `.scratch/<feature-slug>/`，配置在 `docs/agents/`。

两套体系的需求入口互相冲突——一个新需求来了，不知道该先写 REQUIREMENTS.md 还是先跑 `/to-spec`。同时旧体系已经失维护：README 写 5 个扩展、REQUIREMENTS.md 范围树写 7 个、实际目录 6 个（`pi-preview-server/` 是无源码空壳，所有文档均未提及）；`docs/superpowers/plans/` 是空目录碎片。

作为仓库维护者，我需要**一个**权威的需求/规格入口，并且文档与仓库现实的偏差能被自动发现，而不是靠人记得去同步。

## Solution

废除 REQUIREMENTS/SPEC 双文档体系，全面转向 `.scratch/` 工作流：

- **需求与规格的唯一入口**是 Matt 工作流：`/to-spec` 写规格到 `.scratch/<feature-slug>/spec.md`，`/to-tickets` 拆票到 `.scratch/<feature-slug>/issues/`，由 `docs/agents/issue-tracker.md` 的约定约束。
- **保留的耐久文档**只有三类：`README.md`（项目总览，给人看的门面）、`AGENTS.md` / `MY-AGENTS.md`（开发规范，给 agent 看的行为约束）、`docs/agents/*`（skill 配置）。这些文档只描述"稳定事实"，不承载"需求清单"。
- **一次性迁移**：删除根级与 5 个扩展的 `REQUIREMENTS.md` / `SPEC.md`（git 历史已保存全部内容，不做归档副本）；其中仍未实现的待办需求先转成 `.scratch/` 票据再删。
- **一致性校验**：新增 `check-docs` 校验，自动比对文档声明与仓库现实（扩展数量、目录存在性、内部链接、`.scratch/` 文件约定），挂入 turbo 流水线，让文档漂移在 `test` 阶段直接失败。
- 顺手清理碎片：空壳 `pi-preview-server/`、空目录 `docs/superpowers/`。

## User Stories

1. As a 仓库维护者, I want 新需求只从 `/to-spec` 一个入口进入, so that 不再纠结该更新哪份文档
2. As a 仓库维护者, I want 规格和票据集中活在 `.scratch/<feature-slug>/` 下, so that 一个功能的上下文可以一站式查阅
3. As a 仓库维护者, I want 已完成的规格随功能结束而自然归档（git 历史）, so that 工作区里只有活跃的工作
4. As a 仓库维护者, I want AGENTS.md 明确描述新工作流的需求同步规则, so that agent 行为有唯一准则可遵循
5. As a 仓库维护者, I want 删除全部 REQUIREMENTS.md/SPEC.md, so that 旧体系不会继续被误用
6. As a 仓库维护者, I want 旧文档中未实现的待办先转成 `.scratch/` 票据, so that 删除文档不丢失真实需求
7. As a 仓库维护者, I want README 的扩展表格与实际目录自动对齐校验, so that "5 个 vs 6 个 vs 7 个"的漂移不再发生
8. As a 仓库维护者, I want `bunx turbo run test` 在文档漂移时失败, so that 问题在部署前被拦截
9. As a 仓库维护者, I want README/AGENTS.md 中的相对链接被校验, so that 文档不会指向已删除的文件
10. As a 仓库维护者, I want `.scratch/` 的票据文件约定（编号、`Status:` 行）被校验, so that triage/wayfinder 等 skill 总能正确解析
11. As a 仓库维护者, I want `pi-preview-server/` 空壳和 `docs/superpowers/` 空目录被清除, so that 仓库结构反映真实状态
12. As a 新读者（或未来的我）, I want README 用一段话说明文档系统的工作方式, so that 不用考古就能理解仓库如何管理需求
13. As a 仓库维护者, I want docs/agents/ 的 skill 配置文件被纳入提交, so that 团队/他机重建环境时 skill 行为一致
14. As a 使用 Matt skills 的 agent, I want 仓库里不再存在与 issue-tracker.md 约定矛盾的文档规则, so that 我不会收到冲突指令

## Implementation Decisions

- **删除的文档**：根级 `REQUIREMENTS.md`、`SPEC.md`；`pi-extensions/my-{back,bt,html,hud,permission}/` 下的 `REQUIREMENTS.md` 与 `SPEC.md`。不做归档副本——git 历史即归档。
- **保留并重写的文档**：
  - `README.md`：更新目录树与扩展表格（6 → 5，移除空壳后回到 5）；删除"项目级需求文档见 REQUIREMENTS.md"的指引，替换为一段"文档系统说明"（需求规格在 `.scratch/`，由 Matt skills 工作流管理，约定见 `docs/agents/`）。
  - `AGENTS.md`：删除「需求文档同步」一节，替换为「需求与规格工作流」：新需求走 `/to-spec` → `/to-tickets`；`.scratch/` 为工作区，可提交可忽略（见下）；文档修正类变更直接改 README/AGENTS.md。
- **待办迁移**：删除旧文档前，逐份扫描其中"未实现/计划中"的条目，每个有效待办写成 `.scratch/<对应-feature>/issues/NN-<slug>.md`。已确认无活跃待办的扩展（多数已 100% 覆盖实现完毕）直接删除文档。迁移结果在 PR 描述中列出，由用户确认无遗漏。
- **`.scratch/` 的 git 策略**：纳入版本管理（不加入 .gitignore）。理由：issue tracker 配置定义它为本地 markdown tracker，其文件即"票据"，团队/他机需要共享；且 Matt 体系的 map/ticket 设计本身预期被提交。
- **碎片清理**：删除 `pi-extensions/pi-preview-server/`（无源码空壳，仅含 coverage/ 与 node_modules/）与 `docs/superpowers/`（空目录）。删除后在 README、根 `package.json` workspaces、turbo 配置中确认无残留引用。
- **check-docs 模块**：
  - 新建独立 workspace `tools/check-docs/`（纯逻辑 + vitest，纳入 turbo 流水线），对外暴露一个 CLI 入口，根 `package.json` 增加 `check-docs` script，`test` 流水线依赖它。
  - 校验项：
    1. README 扩展表格的行集合 === `pi-extensions/` 实际目录集合（排除非 workspace 目录）
    2. README/AGENTS.md 中的相对 markdown 链接全部可解析
    3. `docs/agents/issue-tracker.md`、`domain.md` 存在；triage skill 安装时 `triage-labels.md` 存在
    4. `.scratch/*/issues/*.md` 文件名符合 `NN-slug` 编号、含 `Status:` 行；`Status:` 值属于 `triage-labels.md` 定义的词表或 wayfinder 的 `claimed`/`resolved`
    5. 仓库任何位置不存在 `REQUIREMENTS.md` / `SPEC.md`（防止旧体系复活）
  - 模块边界：文件系统访问集中在单个 adapter 模块，校验规则为纯函数，便于 100% 覆盖。
- **AGENTS.md 的 `## Agent skills` 区块**：保留不变（setup 产出，已验证）。

## Testing Decisions

- **好测试的标准**：只测外部行为（给定虚拟目录结构，断言校验结果与退出码），不测内部实现（不 mock 私有函数、不断言内部调用顺序）。
- **被测模块**：`tools/check-docs/` 的全部校验规则（纯函数，用内存中的虚拟文件树驱动）与 fs adapter（临时目录集成测试）。
- **Prior art**：仓库现有扩展的测试分层（纯函数单元测试 + 临时目录集成测试，如 my-hud/my-permission 的 vitest 配置），沿用 v8 覆盖率，目标 branches/functions/lines/statements 全部 100%，排除项沿用仓库惯例（types.ts、CLI 入口）。
- **文档修改本身无测试**：README/AGENTS.md 的文案变更由 check-docs 的链接/数量校验兜底。

## Out of Scope

- 修改任何扩展的业务代码与测试（本规格只动文档、结构碎片与新增 tools/check-docs）
- 为 pi-skills / pi-themes / pi-agents 建立独立规格文档（维持现状：由 README 与 AGENTS.md 覆盖）
- 引入 Matt 体系的 CONTEXT.md / docs/adr/（domain docs 已在 docs/agents/domain.md 中声明"惰性创建"，本次不主动建）
- 历史变更日志的迁移（随旧文档删除进入 git 历史，不搬运）
- `.scratch/` 的 CI 远端校验（本仓库无 CI，turbo 本地流水线即全部防线）

## Further Notes

- 这是一次"用新工作流重建文档系统"的自指实践：本规格本身就是第一篇由 `/to-spec` 产出、落在 `.scratch/` 的规格，后续拆票走 `/to-tickets`。
- 执行顺序建议：先建 `tools/check-docs`（让漂移检测先生效）→ 待办迁移 → 删文档/碎片 → 重写 README/AGENTS.md → 全量 `bunx turbo run build test deploy` 验证。
- 风险：删除 REQUIREMENTS/SPEC 后，AGENTS.md 的「修改业务逻辑必须附带测试」「覆盖率 100%」等硬性规则必须保留在 AGENTS.md 中（它们原本只在 REQUIREMENTS.md 里成文的部分要确认 AGENTS.md 已覆盖，未覆盖的补入）。
