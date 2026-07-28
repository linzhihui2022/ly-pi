# my-bt

BT-7274 语音包扩展。在 pi 会话生命周期事件中播放对应语音，并支持通过 `/bt` 命令手动播放或开关。

## 功能

- 自动播放：在配置的事件触发时播放分类语音（默认 `session_start`、`agent_start`、`agent_end`）。
- 权限提示：当 pi 弹出权限确认时播放 `permissionEventMap` 中配置的语音。
- 屏幕浮层：为配置的事件显示 macOS 通知浮层（通过 JXA / `osascript`）。
- 手动控制：通过 `/bt` 命令列出分类、播放单个分类、播放全部、开启或关闭扩展。

## 配置

`my-bt.json`：

| 字段 | 说明 |
|------|------|
| `enabled` | 总开关 |
| `soundDir` | 音频文件目录（相对于扩展根目录） |
| `categories` | 分类定义，每个分类包含 `description` 与 `files` |
| `eventMap` | pi 生命周期事件 → 分类名 |
| `permissionEventMap` | 权限事件 → 分类名 |
| `overlayTextMap` | 事件 → 浮层文案（`type`、`title`、`subtitle`） |

## 命令

```
/bt          列出所有分类及开关状态
/bt <分类>   播放指定分类
/bt all      依次播放全部分类
/bt on       开启语音包
/bt off      关闭语音包
```

## 错误处理

播放或浮层失败时，错误不再输出到 stderr（避免污染 footer），而是通过 `ctx.ui.notify` 以 notice 形式展示给用户。

- 生命周期事件和 `/bt` 命令触发时，会把 `ctx.ui.notify` 传入播放函数。
- `permissions:ui_prompt` 通过 EventBus 订阅，没有 `ExtensionContext`，因此失败时静默，不展示 notice。
- 未提供回调时，player 内部也保持静默。

## 开发与测试

```bash
# 测试
npx vitest run --coverage

# 构建
bun run build

# 部署
bun run deploy
```

覆盖率要求：statements / branches / functions / lines 全部 100%。
