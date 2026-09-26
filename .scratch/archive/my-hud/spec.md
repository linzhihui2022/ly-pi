# my-hud — 模型短名、可隐藏字段与 working 消息稳定化

Status: resolved

## Problem Statement

my-hud 的状态栏在三处缺乏用户控制，影响可读性：statusLine 与 aboveEditor 展示完整模型 ID，在窄终端里挤压其余字段；aboveEditor 的字段集固定，用户无法隐藏不关心的字段（例如 cost）；working 消息在每次渲染时重新随机，同一回合内不断跳变，视觉噪声明显。

## Solution

引入可选配置文件 `my-hud.json`（与扩展目录同级，遵循仓库 JSON 配置约定），承载 `modelShortNames`（完整模型 ID → 显示短名）与 `hiddenFields`（需要隐藏的 aboveEditor 字段）两项用户配置。配置缺失、解析失败或结构非法时静默回退默认行为，`/reload` 后生效。

working 消息改为回合内固定：每个用户提交时随机选定一条并在该回合保持，不再随渲染变化。

## User Stories

1. As a my-hud 用户, I want 把冗长的模型 ID 映射成短名, so that 状态栏在窄终端里仍然可读。
2. As a my-hud 用户, I want 隐藏我不关心的字段（如 cost）, so that 状态栏只保留我实际需要的信息。
3. As a my-hud 用户, I want working 消息在同一回合内保持同一条, so that 状态栏不因每帧重随机而闪烁。

## Implementation Decisions

- 配置文件为扩展目录内的 `ly-pi/my-hud/my-hud.json`，由 `config.ts` 的 `loadHudConfig(dir)` 加载校验；部署时若存在该文件一并拷贝。
- `modelShortNames` 命中时覆盖内置 `SHORT_NAMES`；未命中回退内置短名，再回退完整 ID。
- `hiddenFields` 词表：`project` / `model` / `branch`（含 PR 号）/ `gitStatus` / `context` / `input` / `output` / `cacheRead` / `cost` / `cacheRate` / `permission`。`branch` 与 `gitStatus` 相互独立，可单独隐藏；必须为字符串数组，否则静默回退 `[]`；未命中的条目被忽略。
- `format.ts` 暴露 `setModelShortNames()`、`render.ts` 暴露 `setHiddenFields()`，均由 `index.ts` 启动时装配，`/reload` 重新加载扩展即生效。
- working 消息的挑选时机是 `agent_start`（每用户提交一次），而非 `turn_start` —— pi 的 `turn_start` 在每次工具调用迭代都会触发，这正是消息在同一回合内被打乱的根源。`turn_start` 只保留 git/PR 缓存失效与重渲染。
- working 消息回合内固定为既有行为，不提供配置开关。

## Testing Decisions

- `config.test.ts`：映射命中、未命中、配置缺失、配置损坏、非法 `hiddenFields` 条目。
- `format.test.ts`：短名映射与回退链。
- `render.test.ts`：字段隐藏、未配置、空数组、非法字段名。
- working 消息：`agent_start` 挑选（有/无 theme）、跨 `turn_start` 稳定、异常传播。

## Out of Scope

- footer 点击复制消息内容：判定不做。footer 是单行状态栏，TUI 鼠标点击支持不稳定，且复制已有其他途径。
- working 消息的可配置性。
- 持续根据会话内容更新 HUD。

## Further Notes

本 spec 于 2026-09 从已完成的票据回溯补写（该 feature 未在开工前产出 spec）；三个开放设计决策的原始记录见 `issues/02-hud-open-decisions.md`。
