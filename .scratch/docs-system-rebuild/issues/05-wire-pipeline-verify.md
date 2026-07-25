# 05 — 接入流水线并全量验证

**What to build:** check-docs 成为仓库质量防线的一部分：turbo 的 test 流水线依赖 check-docs，文档漂移会让 `bunx turbo run test` 失败。随后全量验证 `bunx turbo run build test deploy` 全绿，并把本次重建的全部变更（tools/check-docs、删除的文档与碎片、重写的 README/AGENTS.md、docs/agents/、.scratch/）按约定式提交规范拆成语义清晰的 commit 提交。

**Blocked by:** 02 — 新建 tools/check-docs 校验 workspace；04 — 重写 README 与 AGENTS.md

**Status:** claimed

- [ ] turbo test 流水线包含 check-docs，故意引入一处漂移时 test 失败（验证后还原）
- [ ] `bunx turbo run build test deploy` 全绿
- [ ] 全部变更已提交，commit 信息符合约定式规范（全英文、祈使句、首字母小写）
- [ ] docs/agents/ 与 .scratch/ 均已纳入版本管理
