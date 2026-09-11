# 05 — Direct explicit execution and automatic output naming

**What to build:** 简化已明确图片请求的交互：用户明确说明图片操作与编辑/增强目标时，代理不再要求 `CONFIRM_IMAGE_ASSET`。若用户未给输出路径，代理为一次单图调用安全推导输出：生成写入 `.image-gen/<semantic-name>.png`；编辑和增强写入目标图同目录的 `<stem>-<semantic-suffix>.png`。自动候选若冲突，保留已有文件并依次尝试 `-2`、`-3`。不从“最近图片”、工作区扫描或跨会话状态推断编辑目标。

**Blocked by:** 02, 03, 04

**Status:** resolved
**Risk:** Medium
**Approval:** The user approved this scope through the structured authorization and path-default decisions on 2026-09-10, only within `.scratch/image-asset-tool/spec.md`.

- [x] 更新 contract：明确生成/编辑/增强可使用合规自动输出，编辑/增强仍要求用户点名 target；未授权的任意自动路径拒绝
- [x] 实现可测试的自动候选与冲突递增；保留显式用户路径和 `overwrite` 现有语义
- [x] 更新工具指引：明确请求直接调用，输出缺失时传入受限自动候选，不再走常规确认提案
- [x] 覆盖生成目录、派生目录、语意候选限制、冲突递增、缺失 target 拒绝与无确认直接执行
- [x] 更新文档并通过 `bun run verify`、部署和 reload 验证；常规测试不得调用 Codex

## Answer

Implemented bounded automatic output handling in `contract.ts`, `auto-output.ts`, and the tool adapter. A direct clear request may omit a single output: generation accepts only `.image-gen/<semantic-name>.png`; edit/enhance accept only a path beside an explicitly named, workspace-relative target whose filename starts with the target stem and a non-empty semantic suffix. The user’s named output always wins: an automatic candidate is rejected if the user text names a different image path. External targets, multiple inferred outputs, unsafe directories, and automatic overwrite are rejected.

`resolveAutomaticImageAssetRequest()` preserves the semantic candidate first and probes only that output path, then uses `-2` through `-100` on collisions without modifying existing files. Explicit outputs retain the existing batch `overwrite` semantics. Tool guidance now directs the agent to create compliant automatic candidates and never infer an edit target from recent images. Tests use fake runners only. `bun run verify` passed with 74 files / 1200 tests, and `bun run deploy` completed successfully; reload remains the final activation step.
