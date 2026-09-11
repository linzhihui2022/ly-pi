# 01 — update working-message color marquee

**What to build:** 将 my-hud 的 TUI 工作消息从两字素 success 高亮改为逐字素的颜色跑马灯：首轮 `dim → accent → bashMode`，之后无限 `bashMode → accent → bashMode`，每步 150ms；TUI working indicator 使用空 `frames`，并保留 450ms interval。

**Blocked by:** None — can start immediately.

**Status:** resolved

**Risk:** Medium

**Approval:** 用户已明确批准 `.scratch/working-message-color-marquee/spec.md` 及本票源代码与测试实施，并随后明确选择 150ms 作为本次源代码与测试范围调整。自定义 indicator 帧随后在 `5e7a53f` 中移除；用户随后明确选择以 `bashMode` token 作为工作消息跑马灯的第二种颜色。此前的部署授权仅适用于已部署的 250ms 版本；用户现已明确授权通过标准 `bun run deploy` 部署当前 150ms 与空帧 indicator 版本，部署后由用户执行 `/reload`。

- [x] `agent_start` 初始渲染全 dim 工作消息。
- [x] 首轮按字素从左到右完成 accent 与 bashMode 色的扫过。
- [x] 在全 bashMode 后按字素切换为 accent，再切换回 bashMode，且不再回到 dim。
- [x] 保留字素边界、非 TUI 静态消息与现有计时器清理语义。
- [x] 增加或更新公共 UI 接缝的回归测试。
- [x] `bun run verify` 通过。

## Comments

- 用户指定颜色缩写：`D = dim`、`A = accent`、`B = bashMode`（Catppuccin Mocha 中为 peach）。
- 用户确认的循环边界为：`DDDDD → AAAAA → BBBBB → AAAAA → BBBBB → …`。
- 用户随后选择将逐字素间隔从 250ms 调整为 150ms。
- 原先接受的四帧 TUI indicator 随后由 `5e7a53f` 改为无自定义帧（`frames: []`）；TUI 调用仍保留 450ms interval。

## Speed Adjustment

- [x] 将 TUI 逐字素间隔设为 150ms。
- [x] 将颜色循环回归测试的时间推进更新为 150ms。
- [x] 运行 `bun run verify`。
- [x] 不部署 150ms 版本，除非另获明确授权。

## Indicator Adjustment

- [x] TUI indicator 设置为空 `frames`，并保留 450ms interval。
- [x] 公共 UI 接缝回归测试覆盖空 `frames` 与 interval。
- [x] 运行 `bun run verify`。
- [x] 不部署包含 indicator 的版本，除非另获明确授权。

## Answer

- 工作消息现在先逐字素完成 `dim → accent → bashMode`，随后持续在 accent 与 bashMode 之间逐字素切换。
- 回归测试经 `agent_start → setWorkingMessage` 接缝验证首轮和后续循环，并保留计时器清理验证。
- 250ms 版本已通过 `bun run verify`，并已成功通过标准 `bun run deploy` 部署；部署后已请求用户执行 `/reload`。
- 当前 150ms 颜色跑马灯与空帧 indicator 均已通过 `bun run verify`，并已成功通过标准 `bun run deploy` 部署；已请求用户执行 `/reload`。
