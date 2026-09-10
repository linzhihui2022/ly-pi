# working-message-color-marquee — 工作消息颜色跑马灯

Status: ready-for-agent

Risk: Medium

Approval: 用户已在本 Pi 会话明确批准本规格、源代码与测试实施，随后明确选择 150ms 作为源代码与测试范围调整，并接受 450ms 的低频呼吸 working indicator。此前的 250ms 版本部署授权不覆盖这些后续调整；部署和 `/reload` 不在本次调整范围内。

## Problem Statement

`my-hud` 当前让两字素 success 高亮沿工作消息移动。消息末尾只剩一个字素可高亮后会重置，且不能表达连续的颜色过渡。

## Solution

在 TUI 模式中，以每 150ms 为一步，按字素从左到右替换工作消息的颜色。第一轮从 dim 逐字素切换为 accent，再逐字素切换为 success；之后只在 success 与 accent 之间连续往复。工作消息文本与字素顺序不改变。TUI working indicator 同时以 450ms 的 `· → • → ● → •` 低频呼吸，依次使用 dim、muted、accent、muted 色。

对长度为 `n` 的消息，颜色状态必须遵循：

1. 初始：`D^n`。
2. 首轮：`A^i D^(n-i)`，`i = 1…n`；随后 `S^i A^(n-i)`，`i = 1…n`。
3. 循环：`A^i S^(n-i)`，`i = 1…n`；随后 `S^i A^(n-i)`，`i = 1…n`，无限重复。

其中 `D`、`A`、`S` 分别表示主题的 `dim`、`accent`、`success` 前景色。emoji 与组合字符必须保持单个字素的原子性。

## Acceptance Criteria

- TUI 的 `agent_start` 首次调用 `setWorkingMessage` 时，所有工作消息字素均使用 `dim`。
- 每 150ms，恰好一个从左到右的字素切换为当前目标色。
- 第一轮完整呈现 `dim → accent → success`；其后不再回到 `dim`，而是无限呈现 `success → accent → success`。
- `agent_end`、`session_shutdown` 和后续 `agent_start` 仍会停止或替换旧计时器。
- 非 TUI 模式仍只设置一次无 ANSI 样式的静态消息。
- TUI working indicator 使用 `dim ·`、`muted •`、`accent ●`、`muted •` 四帧，间隔 450ms；非 TUI 模式继续隐藏 indicator。
- 本次不改变消息文本或随机选择逻辑，且颜色跑马灯计时周期固定为 150ms。
- 运行 `bun run verify` 成功。

## Testing Decisions

- 测试接缝是 `agent_start` 对 `ctx.ui.setWorkingMessage` 的可观察调用；使用固定随机消息、模拟主题与假计时器验证公开 UI 输出，而不检查局部状态变量。
- 测试以固定文字逐步断言完整首轮、首轮后的 `success → accent` 转场与回到 `success` 的转场。
- 保留既有的计时器停止、重复 agent run 替换和非 TUI 静态消息回归测试。
- 测试同一 `agent_start` 公共 UI 接缝对 `setWorkingIndicator` 的调用，验证四帧、颜色顺序与 450ms 间隔。

## Out of Scope

- 修改工作消息文案、随机选择策略、150ms 节奏或 `Intl.Segmenter`。
- 改变 RPC/print/json 模式的 UI 语义。
- 新增配置项、命令、部署或 `/reload`。
