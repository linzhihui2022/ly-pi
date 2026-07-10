# my-bt Spec

> 状态：已确认，可作为开发基准
> 确认日期：2026-07-10
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

my-bt 是 BT-7274 语音包扩展，负责：
- 在 Pi 生命周期事件与工具调用事件中自动播放分类语音。
- 通过 macOS 通知浮层提供视觉反馈。
- 通过 `/bt` 命令提供手动控制。

## 2. 模块结构

```
pi-extensions/my-bt/
├── index.ts          # 扩展入口：加载配置、注册事件监听与命令
├── player.ts         # 分类列表、文件选择、声音/浮层播放封装
├── coordinator.ts    # 进程协调、PID 文件、锁管理
├── types.ts          # 配置与类型定义
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── my-bt.json        # 语音包配置
├── sounds/           # 音频文件目录
├── scripts/
│   ├── build-overlay.ts  # 编译 JXA 脚本
│   └── deploy.ts         # 部署脚本
├── SPEC.md           # 本文档
└── REQUIREMENTS.md   # 需求清单
```

依赖方向：

```
index.ts → player.ts → coordinator.ts
        → types.ts
```

## 3. 配置

`my-bt.json` 结构：

```ts
interface BtCategory {
  description: string;
  files: string[];
}

interface OverlayTextConfig {
  type: string;
  title: string;
  subtitle?: string;
}

interface BtConfig {
  enabled: boolean;
  soundDir: string;              // 相对于扩展根目录
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;             // 事件名 → 分类名
  toolEventMap?: Record<string, string>;        // 工具名 → 分类名
  permissionEventMap?: Record<string, string>;  // 权限事件名 → 分类名
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
```

## 4. 事件处理

### 4.1 有效生命周期事件

- `session_start`
- `session_shutdown`
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `tool_result`

`eventMap` 中不在上述集合的键会被忽略。

### 4.2 工具调用事件

`toolEventMap` 根据 `tool_call` 事件的 `toolName` 字段映射到分类。

### 4.3 权限事件

`permissionEventMap` 通过 `pi.events?.on("permissions:ui_prompt", ...)` 订阅。该事件没有 `ExtensionContext`，因此失败时静默，不展示通知。

## 5. 声音播放

### 5.1 文件选择

- 每个分类可配置多个文件。
- 单文件分类固定使用该文件。
- 多文件分类按 round-robin 选择，避免连续重复。

### 5.2 播放流程

1. 解析 `soundDir` 为绝对路径。
2. 选择文件。
3. 调用 `spawnSoundProcess` 启动 `afplay`。
4. 播放前终止上一次同类型进程。
5. 记录 PID 到 `~/.my-bt/sound-pids.json`。

### 5.3 错误处理

- 配置加载失败：扩展静默退出。
- 播放或浮层失败：通过 `ctx.ui.notify` 以 `notice` 形式展示；`permissionEventMap` 无 UI 上下文，静默失败。

## 6. 浮层通知

### 6.1 触发

生命周期事件与工具调用事件触发时，若 `overlayTextMap` 包含对应事件配置，则显示浮层。

### 6.2 颜色映射

| 事件 | 颜色 |
|------|------|
| `session_start` | blue |
| `agent_start` | orange |
| `agent_end` | green |
| `permissions_ui_prompt` | red |
| 其他 | blue |

### 6.3 显示流程

1. 读取 `overlayTextMap` 配置。
2. 使用编译后的 `dist/mac-overlay.js` 脚本。
3. 通过 `osascript -l JavaScript` 调用。
4. 播放前终止上一次浮层进程。
5. 记录 PID 到 `~/.my-bt/overlay-pids.json`。

### 6.4 终端检测

按以下优先级检测终端模拟器：
- `TERM_PROGRAM` 环境变量
- `WEZTERM_PANE` / `ITERM_SESSION_ID` 环境变量
- 默认 WezTerm

## 7. `/bt` 命令

| 命令 | 行为 |
|------|------|
| `/bt` | 列出分类、说明、开关状态 |
| `/bt <分类>` | 播放指定分类 |
| `/bt all` | 依次播放全部分类，间隔 1500ms |
| `/bt on` | 开启语音包并持久化配置 |
| `/bt off` | 关闭语音包并持久化配置 |

参数不匹配时提示未知分类。

## 8. 测试策略

- `player.ts`：纯函数（分类列表、文件选择、终端检测）单元测试。
- `coordinator.ts`：锁、PID 记录、进程终止逻辑测试（mock fs 与 child_process）。
- `index.ts`：集成测试，mock ExtensionAPI、事件与命令。
- 覆盖率目标：branches / functions / lines / statements 全部 100%。

## 9. 不做什么

| 功能 | 排除原因 |
|------|----------|
| 跨平台音频播放 | 当前仅使用 macOS `afplay` |
| 网络音频流 | 仅播放本地文件 |
| 按文件自定义音量或速率 | 当前统一使用 `afplay` 默认参数 |
| 浮层交互按钮 | 当前仅展示通知 |
| 语音包自动下载/更新 | 用户自行维护音频文件 |

## 10. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-10 | 补充 my-bt 需求与规格文档，确认事件映射、声音/浮层流程与命令行为 |
