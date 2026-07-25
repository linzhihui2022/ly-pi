# 01 — 迁移旧文档中的未实现待办到 .scratch 票据

**What to build:** 根级与 5 个扩展（my-back、my-bt、my-html、my-hud、my-permission）的 REQUIREMENTS/SPEC 中所有"计划中/未实现"的条目，逐条转成 `.scratch/<对应-feature>/issues/NN-<slug>.md` 下的独立票据（含 Status 行与验收标准），并产出一份"来源条目 → 新票据路径"的迁移清单。已确认无活跃待办的扩展在清单中标注"无待迁移"。用户确认清单后本票完成——这是后续删除旧文档的前置安全阀。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 全部 7 份 REQUIREMENTS.md 与 7 份 SPEC.md（根级 + 5 扩展）均已扫描
- [x] 每个有效待办都有对应的 `.scratch/` 票据文件，符合 issue-tracker.md 的文件约定
- [x] 迁移清单列出每条来源与去向，无活跃待办的扩展显式标注
- [x] 用户在清单上确认无遗漏

## Answer

迁移清单见 `.scratch/docs-system-rebuild/migration-list.md`，用户已确认无遗漏。仅 my-hud 有活跃待办，迁移为 `.scratch/my-hud/issues/01-model-short-names.md` 与 `02-hud-open-decisions.md`；根级文档的流程规则由票 04 核对并入 AGENTS.md；其余扩展确认无活跃待办。
