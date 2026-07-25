# 02 — my-hud 三个开放设计决策

**What to build:** 这不是实现票，而是决策票：对旧 SPEC「待决策项」中的三个开放问题逐一做出做/不做的结论，并把结论记录下来（做了的另起实现票）。三个问题：(1) footer 是否支持点击复制消息内容；(2) aboveEditor 字段是否允许用户通过配置隐藏（如 Cost）；(3) working 消息是否在同一回合内保持同一条（当前每 turn_start 重新随机）。建议用 /grilling 或一次短讨论完成决策。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] footer 点击复制：有明确做/不做结论
- [x] aboveEditor 字段可隐藏：有明确做/不做结论
- [x] working 消息回合内固定：有明确做/不做结论
- [x] 结论记录在本文件 ## Answer 下；决定做的项已另建实现票

## Answer

2026-07 与用户短讨论后逐项拍板：

1. **footer 点击复制消息内容 → 不做**。footer 是单行状态栏，TUI 鼠标点击支持不稳定；复制消息内容已有其他途径，收益低、实现复杂。
2. **aboveEditor 字段可通过配置隐藏 → 做**。复用 01 票引入的 `my-hud.json`，成本低，符合仓库配置约定。已另建实现票 `03-hideable-fields.md`。
3. **working 消息回合内固定 → 做**。减少视觉噪音，改动小。已另建实现票 `04-stable-working-message.md`。
