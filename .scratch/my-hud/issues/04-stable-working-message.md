# 04 — working 消息在同一回合内保持同一条

**What to build:** my-hud 的 working 消息从"每次渲染重新随机"改为"回合内固定"：turn_start 时随机选定一条，该回合内所有渲染都使用同一条；下一回合 turn_start 再重新随机。行为不可配置。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 同一回合内多次渲染显示同一条 working 消息
- [ ] 新回合 turn_start 时重新随机
- [ ] 单元测试覆盖：回合内固定、跨回合重选
