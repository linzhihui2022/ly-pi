# my-bt 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

提供本地 Pi 语音包扩展 `my-bt`，在 Pi 会话生命周期与工具调用事件中自动播放分类语音，并支持 `/bt` 命令手动控制、macOS 通知浮层展示。

## 功能需求

### 自动播放

1. 扩展通过 `my-bt.json` 配置事件到分类的映射。
2. 支持以下生命周期事件触发：`session_start`、`session_shutdown`、`agent_start`、`agent_end`、`turn_start`、`turn_end`、`tool_result`。
3. 支持 `toolEventMap`，按工具名触发指定分类。
4. 支持 `permissionEventMap`，在权限确认事件触发时播放语音。
5. 配置无效或不存在时，扩展静默不工作。

### 通知浮层

1. 通过 `overlayTextMap` 为事件配置浮层文案（`type`、`title`、`subtitle`）。
2. 浮层通过 `osascript` 调用编译后的 JXA 脚本显示。
3. 浮层仅支持 macOS 终端模拟器（WezTerm、iTerm、Terminal）。
4. 浮层支持按 slot 垂直堆叠，最多 5 个。

### 声音播放

1. 使用 `afplay`（macOS）播放音频文件。
2. 播放采用 fire-and-forget 方式，不阻塞 Pi 主流程。
3. 播放新语音前终止同类型正在播放的进程，避免重叠。
4. 每个分类支持多个文件，按 round-robin 选择。
5. 错误通过可选的 `onError` 回调报告，不输出到 stderr。

### `/bt` 命令

1. `/bt` 列出所有分类、状态及说明。
2. `/bt <分类>` 播放指定分类。
3. `/bt all` 依次播放全部分类。
4. `/bt on` 开启语音包。
5. `/bt off` 关闭语音包。
6. 关闭状态下播放命令提示用户先开启。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 覆盖率要求：branches / functions / lines / statements 全部 100%。
3. 构建命令：`bunx turbo run build`。
4. 测试命令：`bunx turbo run test` 或在扩展目录执行 `npx vitest run --coverage`。
5. 部署命令：`bun run deploy`，目标目录为 `~/.pi/agent/extensions/my-bt`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 跨平台音频播放 | 当前仅使用 macOS `afplay` |
| 网络音频流 | 仅播放本地文件 |
| 按文件自定义音量或速率 | 当前统一使用 `afplay` 默认参数 |
| 浮层交互按钮 | 当前仅展示通知 |
| 语音包自动下载/更新 | 用户自行维护音频文件 |

## 验收标准

1. 生命周期事件触发正确分类。
2. 工具调用事件触发正确分类。
3. 权限事件触发正确分类。
4. `/bt` 各子命令行为正确。
5. 播放与浮层错误通过 `notify` 报告。
6. 单元测试和覆盖率检查通过。
