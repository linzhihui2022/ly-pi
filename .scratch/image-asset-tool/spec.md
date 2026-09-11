# image-asset — Codex 驱动的 Pi 图片资产工具

Status: resolved
Risk: Medium
Approval: The user approved this specification, the ticket breakdown, and the isolated three-scenario Codex probe on 2026-09-10. After the first simple-geometry probe was found invalid under the official skill rules, the user additionally approved one corrected non-geometric generation probe on 2026-09-10. After the official skill established that edit/enhance require a target, the user approved one Image Target plus one optional Reference Image on 2026-09-10. Approval applies only to this specification's scope and acceptance criteria.

## Problem Statement

当前 Pi 只能分析已有图片，不能为当前仓库生成、编辑或增强图片资产。用户希望在明确提出图片请求时，Pi 能借助本机 `codex exec` 的 `$imagegen` 能力交付可追踪的项目文件，而不自主产生计费调用或覆盖现有资产。

## Solution

新增一个向 Pi 代理注册的原生工具 `image_asset`。它服务仓库图片资产工作流，统一提供 `generate`、`edit` 和 `enhance` 三种 operation；不提供独立 slash command、自动系统查看器或自动视觉迭代。

工具后端仅使用经真实探针验证的 Codex `$imagegen` 契约。探针未能证明能力时，不发布工具、不引入替代图像供应商。

## User Stories

1. As a Pi 用户, I want 明确要求生成项目图片，而在未指定输出路径时由 Pi 使用安全的约定路径, so that 我获得一张可加入项目的图片资产。
2. As a Pi 用户, I want 提供一张明确的编辑/增强目标和一张可选参考图, so that Pi 能基于真实的编辑语义生成新的派生资产而不修改源图。
3. As a Pi 用户, I want 一次请求多个明确的输出路径, so that 我能得到有限数量的可审计视觉变体。
4. As a Pi 用户, I want Pi 在请求或路径不明确时先追问/建议路径, so that 不会产生意外计费、外传或文件写入。
5. As a Pi 用户, I want 明确看到最终发给 Codex 的提示词和每个输出状态, so that 我可以追溯一次图片操作。

## Tool Contract

`image_asset` 接收最小图片请求：

- `operation`: `generate`、`edit` 或 `enhance`；
- 非空最终图片提示词；
- `target_path` 与可选 `reference_path`: 图片生成不传入；编辑和增强必须传入唯一目标，可另传一张参考图；
- `output_paths`: 一至四个工作区相对路径；用户点名路径时保留原样，未点名时代理仅可为单图调用传入符合自动命名策略的候选；其数量决定变体数量；
- `overwrite`: 可选，默认 false。

首版不暴露尺寸、比例、风格或单输出专用渲染参数；这些要求写入最终图片提示词。输出扩展名是格式请求，只有在 Codex 探针验证该格式后才接受；当前仅验证 PNG，因此 v1 只接受 `.png` 输出路径。内置模式的实际像素尺寸由提供者决定，不能承诺提示词中的尺寸。

所有输出路径解析后的真实目标必须仍在当前工作区内；允许创建缺失父目录。源路径可在工作区内外，但会解析符号链接到真实目标。输出永不等于或覆盖源图。

用户未点名输出路径时，代理只可为**单图**调用自动命名：生成写入 `.image-gen/<semantic-name>.png`；编辑和增强写入明确、工作区相对 Image Target 同目录的 `<stem>-<semantic-suffix>.png`。语意名称由请求生成；若候选已存在，则保留旧文件并追加 `-2`、`-3`。工作区外 Image Target 必须由用户指定工作区输出路径。自动命名绝不覆盖源图、不会扫描工作区、不会从“最近图片”或跨会话状态推断编辑目标。

## Authorization and Privacy

工具只在 Explicit Image Request 下执行。运行时以最近会话验证：

- 用户直接明确要求图片生成、编辑或增强；编辑和增强仍必须在用户文本中点名唯一 Image Target。用户点名输出路径时，所有路径必须匹配；用户未点名输出路径时，只接受上述受限单图自动候选；或
- 用户的原始明确请求后，代理发出含操作、提示词、输入及精确输出路径的 `IMAGE_ASSET_PROPOSAL`，用户回复 `确认图片资产` 或 `CONFIRM_IMAGE_ASSET`。

任何缺失编辑目标、孤立的肯定词、不合规的自动候选或不匹配的会话链都会阻止调用。工具指引不是唯一保护层。

用户在明确请求中点名的源路径只授权 Codex 处理这些文件及其解析后的真实目标。最终图片提示词只可包含用户请求和安全资产元数据（例如文件名、尺寸、用途）；不得包含源代码、文档正文、凭据或其他文件内容。

## Execution and Failure Semantics

每个 `output_path` 在暂存区按路径顺序由独立 Codex 调用生成。每个步骤若被判定为临时失败，最多自动重试一次；第二次失败使整个批次失败。

所有暂存输出必须可作为图片解码后，才原子发布到目标路径。若 `overwrite: true`，发布前须备份已有目标；任一发布步骤失败时，恢复所有旧资产。不会部分发布成功图片。

成功结果为结构化记录：最终提示词、operation、源图、输出路径及状态。它不写旁车 provenance 文件，也不做内联预览；代理可按需读取返回路径。失败只返回安全摘要与错误类别，不原样泄露 Codex stderr。

## Capability Gate

在任何功能代码前，在隔离临时目录进行三次最小、可能计费的真实 Codex 探针：

1. 图片生成：零张源图；
2. 图片编辑：一个明确的图片目标和一张参考图；
3. 图片增强：一个明确的图片目标和一张参考图，覆盖保真修复、创意改良或交付适配中的明确目标。

每一场景必须产生新的可解码图片，并由视觉能力核验其符合操作意图。探针还必须记录可用的 `$imagegen` 调用方式、输入/输出位置和实际输出格式。任一场景失败、无法验证或不符合意图时，停止实现且不发布工具。

## Validation Contract

- 先为参数、路径、授权链、隐私边界、暂存/原子发布、重试和安全错误映射写失败测试，再实现。
- 真实 Codex 仅用于上述受批准的能力探针；常规测试必须使用受控 fake runner，不依赖网络、凭据或计费服务。
- 完成变更后必须通过 `bun run verify`。
- 部署验证为 `bun run deploy` 后执行 `/reload`，再在 Pi 中验证工具注册与拒绝/成功路径。

## Out of Scope

- 其他图像供应商、后备路由或多后端抽象。
- 自动视觉复核、自动多轮优化、自动打开图片或工具行内联预览。
- 工作区外输出、远程 URL 输入、三张以上源图、五张以上输出、原地修改源图。
- 图像格式本地转码、未验证格式、旁车 provenance 文件。
- 将任意仓库内容、源代码、文档正文或凭据写入 Codex 提示词。

## Further Notes

本规格来自已完成的 grilling/domain-modeling 会话。领域术语已记录在 `CONTEXT.md`。Codex built-in image generation 已成为实现的硬依赖，且其默认产物需从 `$CODEX_HOME/generated_images/` 复制到工作区；该边界与不静默回退 API 的决定已记录于 `docs/adr/0011-codex-built-in-imagegen.md`。

Capability gate update (2026-09-10): 首个零源图探针请求的是简单几何图形，正式 imagegen skill 将其排除在生图范围外，因此 Codex 以本地 Python 绘图完成，不构成能力证明。修订后的复杂生成、目标加参考图编辑、目标加参考图增强均通过：每项都产生了可解码 PNG 并经视觉核验。内置模式先把产物保存到 `$CODEX_HOME/generated_images/`，再由 Codex 复制到隔离目录；已验证的输出格式仅为 PNG。
