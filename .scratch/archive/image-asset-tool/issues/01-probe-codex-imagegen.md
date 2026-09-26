# 01 — Verify Codex `$imagegen` capability

**What to build:** 在隔离临时目录执行且只执行三次最小、可能计费的真实 Codex 探针；不写产品功能代码。验证：零源图的复杂栅格生成、一个明确目标加一张参考图的编辑、一个明确目标加一张参考图的增强。每个场景必须得到新的可解码图片，并由视觉能力核验其实际符合请求意图。记录已验证的 `$imagegen` 调用形式、输入/输出位置、可用格式和可安全识别的失败类别；不要原样写入 stderr、提示词或绝对私有路径。

**Blocked by:** None — can start immediately

**Status:** resolved
**Risk:** Medium
**Approval:** The user approved this isolated three-scenario probe on 2026-09-10, only within `.scratch/image-asset-tool/spec.md`. After the initial simple-geometry request was ruled invalid by the official skill, the user additionally approved one corrected non-geometric generation probe on 2026-09-10.

- [x] 探针在隔离目录运行，产物不进入项目资产目录，且不使用真实/敏感源图
- [x] 生成场景以零源图产生新的可解码图片并通过视觉核验
- [x] 编辑场景以一个目标和一张参考图产生新的可解码图片并通过视觉核验
- [x] 增强场景以一个目标和一张参考图产生新的可解码图片并通过视觉核验
- [x] 记录经验证的命令契约、输出格式和安全错误类别
- [x] 所有有效场景均通过；未启动后备 API 或产品实现

## Answer

Stopped after the first approved zero-source scenario on 2026-09-10. The command produced a new 128×128 PNG, and visual inspection confirmed the requested blue field with a centered white circle. However, the Codex event trace contained a local `command_execution` that created the PNG with Python; it contained no image-generation-tool event. The agent explicitly selected a simple-geometry exception instead of proving `$imagegen`.

This result proves only that Codex can cause a local process to create a trivial PNG. The official imagegen skill subsequently confirmed that simple shapes are outside the skill's intended scope, so this was an invalid capability test rather than proof that the built-in tool is unavailable. It does **not** prove the requested `$imagegen` capability or its image edit/enhance contract. Per the hard gate, the remaining two probes were not run and no product code was started. The user approved one corrected non-geometric generation probe; it completed with a real rich PNG copied from Codex's generated-images location, proving the built-in generation path. The same official skill requires a single edit target plus optional reference input, and the user approved that corrected input contract before edit/enhance probing.

Validated results: the corrected zero-source generation, target-plus-reference edit, and target-plus-reference enhancement each produced a visually valid PNG through built-in `image_gen`. All artifacts were first placed under `$CODEX_HOME/generated_images/` and then copied into the isolated probe directory. The only verified output format is PNG; observed output was square 1254×1254 despite a 1024×1024 request, so built-in mode cannot promise caller-selected dimensions. A transient transport warning was observed before one successful edit, supporting a safe `network` failure category; no fallback API mode or product code was used.
