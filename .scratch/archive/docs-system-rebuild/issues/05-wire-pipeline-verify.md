# 05 — 接入流水线并全量验证

**What to build:** check-docs 成为仓库质量防线的一部分：turbo 的 test 流水线依赖 check-docs，文档漂移会让 `bunx turbo run test` 失败。随后全量验证 `bunx turbo run build test deploy` 全绿，并把本次重建的全部变更（tools/check-docs、删除的文档与碎片、重写的 README/AGENTS.md、docs/agents/、.scratch/）按约定式提交规范拆成语义清晰的 commit 提交。

**Blocked by:** 02 — 新建 tools/check-docs 校验 workspace；04 — 重写 README 与 AGENTS.md

**Status:** resolved

- [x] turbo test 流水线包含 check-docs，故意引入一处漂移时 test 失败（验证后还原）
- [x] `bunx turbo run build test deploy` 全绿
- [x] 全部变更已提交，commit 信息符合约定式规范（全英文、祈使句、首字母小写）
- [x] docs/agents/ 与 .scratch/ 均已纳入版本管理

## Answer

check-docs 的 test 脚本在单测后执行仓库校验（CLI 的 repo root 改为基于脚本位置解析），turbo test 天然包含。负向验证：临时创建未登记的 my-fake 扩展目录，turbo run test 按预期失败并报出漂移，随后还原。全量 bunx turbo run build test deploy 22/22 通过。提交整理为三个语义 commit：feat(check-docs) 工作区、docs(scratch) 规格与票据、refactor(docs) 废除旧体系。工作区干净，check-docs 5/5 通过。
