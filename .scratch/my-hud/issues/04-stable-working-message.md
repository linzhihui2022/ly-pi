# 04 — working 消息在同一回合内保持同一条

**What to build:** my-hud 的 working 消息从"每次渲染重新随机"改为"回合内固定"：turn_start 时随机选定一条，该回合内所有渲染都使用同一条；下一回合 turn_start 再重新随机。行为不可配置。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 同一回合内多次渲染显示同一条 working 消息
- [x] 新回合 turn_start 时重新随机
- [x] 单元测试覆盖：回合内固定、跨回合重选

## Answer

2026-07 实现完成，有一处对原描述的修正：

- **语义修正**：pi 的 `turn_start` 在每次工具调用迭代都会触发（`agent-loop.js` 内层循环），并非每用户回合一次——这正是消息回合内被打乱的根源。因此挑选时机从 `turn_start` 改为 `agent_start`（每用户提交触发一次），`setWorkingMessage` 设置后在 pi 侧持续有效
- `turn_start` 处理器只保留 git/PR 缓存失效与重渲染，不再触碰 working 消息
- 测试：agent_start 挑消息（有/无 theme）、跨 turn_start 稳定、异常传播，共 5 条；全量 221 通过，覆盖率 100%
