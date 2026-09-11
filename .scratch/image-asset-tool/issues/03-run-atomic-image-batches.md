# 03 — Run atomic Codex image batches

**What to build:** 使用 01 已验证的 Codex `$imagegen` 契约实现可替换的执行薄壳：针对每个输出路径顺序地在暂存区生成一张图片，验证可解码性，再原子发布整个批次。常规测试使用 fake runner，绝不产生网络或计费调用。

**Blocked by:** 01, 02

**Status:** resolved
**Risk:** Medium
**Approval:** The user approved this scope on 2026-09-10, only within `.scratch/image-asset-tool/spec.md`.

- [x] 每个输出路径对应一次顺序 Codex 调用；最多四张输出，不做并行或依赖原生批量 API
- [x] 被判定为临时失败时，只重试该输出一次；第二次失败会丢弃暂存并失败整个批次
- [x] 所有暂存产物均可解码后才发布，任何生成/发布失败均不部分发布
- [x] `overwrite: true` 时备份已有目标，发布失败时完整恢复旧资产；源图永不覆盖
- [x] 返回安全错误类别和摘要，不透传 stderr；fake-runner 测试覆盖成功、重试、解码失败、覆盖恢复和取消

## Answer

Implemented `ly-pi/my-image-asset/batch.ts` and `codex.ts`. The batch runs one output at a time into a workspace-local staging directory, requires every staged image to pass the injected decoder, then publishes all files. Existing outputs are rejected before generation unless `overwrite: true`; overwrite publication moves backups into staging and restores every prior asset if any backup or publish step fails.

Publication state is recorded with a versioned, path-validated journal. Overwrite targets are backed up before publication; non-overwrite targets use a no-clobber hard link, and the journal retains the staged hard link until commit so an interrupted publication can be recovered without mistaking an unrelated file for a published output. Stale, malformed, symlinked, or unrecognized staging state fails closed and cleanup failures remain actionable.

The Codex adapter uses argv-only `codex exec --ephemeral --sandbox workspace-write --json`, attaches Image Target before optional Reference Image, and asks built-in `image_gen` to copy its artifact into the prescribed staging path. It verifies the completed event's absolute artifact path against the staged file bytes and uses macOS `sips -g format` to accept only PNG inspection results. Process stderr is used only to classify transient failures and is never returned. Fake-runner/decoder tests cover ordered success, retry, second failure, invalid output, no-clobber publication, overwrite recovery, cancellation, command construction, artifact provenance, and safe error mapping; no test invokes Codex.
