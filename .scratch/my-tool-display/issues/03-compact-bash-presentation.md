# 03 — 提供紧凑 bash 结果

**What to build:** Pi 用户执行 `bash` 时可直接看到命令和成功/失败状态；成功输出默认只显示有限行数，失败输出默认保留最后有限行数，展开后仍看到 Pi 原生完整结果。用户可在 JSON 配置中调整折叠行数，错误状态不会因紧凑规则而丢失。

**Blocked by:** 01 — 建立自有 read 紧凑呈现

**Status:** resolved

**Risk:** Medium

**Approval:** 原始范围已获批准。本次范围更新中，用户明确要求“失败输出也折叠”，并选择保留“后 N 行”。

- [x] `bash` 调用头显示实际命令和执行状态，成功输出默认最多显示 10 行
- [x] `bashCollapsedLines` 可调整成功输出的默认可见行数；缺失、损坏或非法字段安全回退到 10
- [x] Bash 失败输出在未展开时保留错误状态及最后 `bashCollapsedLines` 行；被隐藏的前序行显示明确提示
- [x] 展开状态对成功和失败的 Bash 都显示 Pi 实际返回的完整原始输出，且不会绕过 Pi 自身的截断
- [x] 自动化测试覆盖默认值、有效/无效配置、成功与失败折叠、展开与空错误路径，且 `bun run verify` 通过

## Answer

- 未展开的 Bash 失败结果现在保留 `Bash command failed.`，显示最后 `bashCollapsedLines` 行，并在更早行被隐藏时提示其数量。
- 展开后继续显示完整 Pi 原始输出；配置为 0 时保留失败标题和隐藏提示。
- 验证：`bun run verify` 通过（1110 个 Vitest 测试、类型检查、Biome 与文档检查）。

## Comments

- Scope update: 用户明确要求失败 Bash 输出也折叠，并选择保留最后 N 行。
