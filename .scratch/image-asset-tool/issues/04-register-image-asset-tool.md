# 04 — Register and validate the native `image_asset` tool

**What to build:** 将已验证的 contract 和 runner 接入 ly-pi，向 Pi 代理注册单一原生工具 `image_asset`，并以工具描述/会话授权检查落实“仅显式请求”。成功只返回结构化记录与工作区路径；首版不提供 slash command、旁车 provenance、内联预览或自动优化循环。

**Blocked by:** 01, 02, 03

**Status:** resolved
**Risk:** Medium
**Approval:** The user approved this scope on 2026-09-10, only within `.scratch/image-asset-tool/spec.md`.

- [x] 注册 `image_asset`，使用严格 TypeBox schema 和与 Pi 文档一致的工具结果/错误语义
- [x] 工具指引要求显式图片请求；运行时阻止不符合已定义会话授权链的调用
- [x] 成功返回最终提示词、operation、源图、输出路径及状态；用户/代理按需通过现有读图能力查看产物
- [x] 加入模块入口、统一入口接线和必要用户文档，且不影响现有 `my-vision` 的只读分析职责
- [x] 完成 mock Pi/runner 测试，并通过 `bun run verify`

## Answer

Added `ly-pi/my-image-asset/index.ts` and registered it from the unified extension entry. The one native `image_asset` tool uses the strict contract schema, sequential execution, active-branch-only session parsing, and the deterministic direct/confirmed authorization chain before it resolves or touches any path. It serializes batches that share an output path, then returns a structured published record containing the final prompt, operation, resolved source paths, output paths, and authorization mode.

Tool guidelines require an explicit image request and exact confirmation proposal when paths need approval; vague direct enhancement requests are rejected unless the user states an enhancement goal. The adapter uses injected fake runner/decoder tests, so no test starts Codex. `README.md` documents the user flow, Codex quota caveat, PNG/sips requirement, and read-only relationship with `my-vision`. `bun run verify` passed: 73 test files, 1185 tests.
