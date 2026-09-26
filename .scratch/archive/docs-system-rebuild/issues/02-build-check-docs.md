# 02 — 新建 tools/check-docs 校验 workspace

**What to build:** 一个可独立运行的 `bun run check-docs` 命令，对仓库执行 5 项文档一致性校验并以非零退出码报告失败：(1) README 扩展表格的条目集合与 pi-extensions/ 实际 workspace 目录集合一致；(2) README/AGENTS.md 中的相对 markdown 链接全部可解析；(3) docs/agents/issue-tracker.md 与 domain.md 存在，triage skill 安装时 triage-labels.md 存在；(4) .scratch 票据文件符合 NN-slug 编号且含合法 Status 行（词表来自 triage-labels.md 及 wayfinder 的 claimed/resolved）；(5) 仓库任何位置不存在 REQUIREMENTS.md / SPEC.md。校验规则为纯函数（内存虚拟文件树驱动），文件系统访问集中在单个 adapter；vitest 覆盖率 branches/functions/lines/statements 全部 100%。本票**不**接入 turbo 流水线（接入在票 05）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `bun run check-docs` 可运行并输出每项校验的通过/失败明细
- [x] 5 项校验全部实现，当前仓库上运行能正确报告现存漂移（REQUIREMENTS/SPEC 存在，12 项）
- [x] 校验规则为纯函数，测试只断言外部行为（给定虚拟文件树 → 校验结果/退出码）
- [x] vitest 覆盖率四项指标 100%，排除项沿用仓库惯例（types.ts、index.ts）
- [x] workspace 纳入根 package.json workspaces 与 turbo 任务图（但 test 流水线尚不依赖它）

## Answer

实现于 `tools/check-docs/`：五项校验各为一个纯函数模块（`checks/`），`file-system.ts` 集中文件系统访问（含 triage skill 探测），`index.ts` 为 CLI 入口（从仓库根运行，退出码 = 失败数 > 0）。33 个测试全绿，覆盖率四项 100%，typecheck 通过，biome 检查通过。在真实仓库上运行正确报告 12 个 legacy 文档待删除，其余四项 PASS。
