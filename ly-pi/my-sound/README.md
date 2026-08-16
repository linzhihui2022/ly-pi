# my-sound

语音包扩展。在 pi 会话生命周期事件中播放对应语音，并支持通过 `/sound` 命令手动播放、开关或切换语音包。

## 功能

- 自动播放：在配置的事件触发时播放分类语音（默认 `session_start`、`agent_start`、`agent_end`）。
- 权限提示：当 pi 弹出权限确认时播放 `permissionEventMap` 中配置的语音。
- 屏幕浮层：为配置的事件显示 macOS 通知浮层（通过 JXA / `osascript`）。
- 手动控制：通过 `/sound` 命令列出分类、播放单个分类、播放全部、切换语音包、开启或关闭扩展。
- 多语音包：每个语音包自带音频目录与分类定义（per-pack categories），互不干扰。

## 配置

`my-sound.json`（源文件在 `ly-pi/assets/config/`，经 `bun run deploy` 部署）：

| 字段 | 说明 |
|------|------|
| `enabled` | 总开关 |
| `activePack` | 当前语音包名（对应 `packs` 中的键） |
| `packs` | 语音包字典。每个包包含 `soundDir`（音频目录，相对于扩展根目录）与 `categories` |
| `categories`（pack 内） | 该包的分类定义，每个分类包含 `description` 与 `files` |
| `eventMap` | pi 生命周期事件 → 分类名 |
| `permissionEventMap` | 权限事件 → 分类名 |
| `toolEventMap` | 工具名（如 `ask_user_question`）→ 分类名 |

### 新增语音包

1. 音频文件放入 `ly-pi/assets/sounds/<pack-name>/`
2. 在 `packs` 中注册：`"<pack-name>": { "soundDir": "sounds/<pack-name>", "categories": { ... } }`
3. `bun run deploy` 后用 `/sound pack <pack-name>` 切换

分类的 `files` 留空时该分类静默跳过，可以先搭骨架再逐步补音频。

## 命令

```
/sound          列出当前语音包的分类及开关状态
/sound <分类>   播放指定分类
/sound all      依次播放全部分类
/sound packs    列出所有语音包
/sound pack <名> 切换到指定语音包
/sound on       开启语音
/sound off      关闭语音
```

## 错误处理

播放或浮层失败时，错误不再输出到 stderr（避免污染 footer），而是通过 `ctx.ui.notify` 以 notice 形式展示给用户。

- 生命周期事件和 `/sound` 命令触发时，会把 `ctx.ui.notify` 传入播放函数。
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
