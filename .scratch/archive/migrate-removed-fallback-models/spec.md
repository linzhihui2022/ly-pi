# 清理已移除的 fallbackModels

Status: resolved

## Problem Statement

`pi-subagents 0.68.0` 移除了 `fallbackModels` 字段。本机 `~/.pi/agent/settings.json` 的 agent override 中仍保留该字段（例如 `image-reader` 下的空数组），导致 Pi 启动时扩展报错。仓库源配置本身不含该字段，而部署流程会保留本机自有的模型设置，因此旧字段不会被覆盖清除。

## Solution

在部署边界增加一次窄范围配置迁移：部署时从 `subagents.agentOverrides.*` 与 `subagents.agentOverridesByProvider.*.*` 中删除已废弃的 `fallbackModels`，其余字段原样保留。

## Implementation Decisions

- 迁移只针对 `fallbackModels`，不触碰 `model`、`thinking` 及其他合法字段，不改变本机模型选择。
- 未配置对应对象时部署行为保持不变。
- 不在 `assets/config/settings.json` 中变更或新增模型回退行为，也不引入新的回退机制。

## Testing Decisions

- 新增 staging 部署回归测试：含 `fallbackModels` 的旧 settings 经部署后不再含该字段，其他 override 字段与非 override 配置保持不变；未配置对应对象时行为不变。
- 回归测试先失败后通过；`bun run verify` 与 `bun run deploy` 均通过，部署后重新运行原始启动探针不再报告扩展错误。

## Out of Scope

- 不修改本机模型选择，不新增模型回退行为。
- 不为历史 Pi 版本保留向后兼容。

## Further Notes

本 spec 于 2026-09 从已完成的票据回溯补写（该 feature 未在开工前产出 spec）。
