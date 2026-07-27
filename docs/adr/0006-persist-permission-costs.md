# 持久化法庭三角色的 LLM 成本

为法官（judge）、辩护人（advocate）、检察官（prosecutor）的每一次 LLM 调用持久化成本记录，用于跨会话的账单监控。

采用 JSONL 追加写入 `~/.pi/costs/<项目目录>/<sessionId>.jsonl`（按项目、会话分文件），每条记录包含 `type`（五个子类型）、`cost`（USD 原始值）、`model`（实际调用的模型）、`ts`（ISO 8601 时间戳）。展示时按 USD × 7 转 CNY，与 my-hud 的单位约定一致。

## Considered Options

- **单聚合 JSON 文件（`~/.pi/permission-costs.json`）**：被拒绝。JSON 聚合需要读→改→写→rename 的原子替换，JSONL 追加写入由 OS 保证单行原子性，实现更简单。
- **按角色分文件**：被拒绝。五个 type 在一个文件内更易聚合，且同一会话的成本天然在一起。
- **成本单位存 CNY**：被拒绝。存 USD 原始值，汇率变更时历史数据不会偏；展示时实时换算。

## Consequences

- 每次 LLM 调用后立即 `appendFileSync`，在调用路径上有同步 I/O（单条记录 < 200 字节，实际延迟可忽略）。
- 新增 `/judge-costs` 命令用于聚合查看累计成本。
- 法官的 session entry 成本字段保留（双写），不影响现有 `judge-log` 功能。
