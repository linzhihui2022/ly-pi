# 02 — Define `image_asset` contract and safety boundary

**What to build:** 建立可测试的图片资产领域模型和严格输入边界，为单一原生 `image_asset` tool 准备 schema 与纯逻辑。请求只包含 operation、最终图片提示词、编辑/增强必填的唯一 Image Target、可选 Reference Image、一至四个工作区输出路径和可选显式覆盖；不引入渲染参数或多后端抽象，并遵循 `docs/adr/0011-codex-built-in-imagegen.md`。

**Blocked by:** 01 — Probe Codex `$imagegen` capability

**Status:** resolved
**Risk:** Medium
**Approval:** The user approved this scope on 2026-09-10, only within `.scratch/image-asset-tool/spec.md`.

- [x] 严格校验 `generate`/`edit`/`enhance`、源图数量、输出数量、非空提示词、重复路径和 source/target 重叠
- [x] 将源链接解析到真实目标；将输出真实目标限制到当前工作区并允许创建缺失父目录
- [x] 实现“直接明确请求”及“请求 → 精确建议 → 确认”会话授权链；歧义一律拒绝
- [x] 限定最终提示词可添加的安全资产元数据，不采集源代码、文档正文、凭据或其他文件内容
- [x] 单元测试覆盖接受与拒绝边界；不调用 Codex

## Answer

Implemented `ly-pi/my-image-asset/contract.ts` with a strict TypeBox schema, canonical source/output resolution, PNG-only output validation, and source/output non-overlap checks. Source symlinks resolve to their real targets; output targets resolve through existing ancestors and cannot escape the canonical workspace through a symlink.

Authorization is deterministic rather than inferred: a direct user request must name every supplied path, while the suggestion flow binds a serialized `IMAGE_ASSET_PROPOSAL` to `确认图片资产` or `CONFIRM_IMAGE_ASSET` and an earlier explicit request. `buildFinalImagePrompt()` reads no files and emits only user prompt text plus safe filenames and workspace-relative outputs. `contract.test.ts` covers 26 acceptance/rejection cases without starting Codex, including rejection of a vague direct enhancement request and recognition of an explicit Chinese “生成一张……” confirmation source.
