# BT-7274 权限 Ask 氛围提醒设计

## 背景

当 `@gotgenes/pi-permission-system` 的权限规则配置为 `"ask"` 时，Pi 会弹出内置的权限确认对话框。为了让 BT-7274 语音包在权限确认时也能提供氛围提醒，需要在权限 ask 触发时同步播放 BT 声音和 mac-overlay 弹窗。

## 目标

- 在 Pi 权限 ask 触发时，BT 播放声音 + mac-overlay 弹窗作为氛围提醒
- 不替换 Pi 内置权限确认流程，仅作为额外提醒
- 保持与现有 `my-bt` 扩展架构一致

## 技术方案

### 事件来源

`@gotgenes/pi-permission-system` 在权限 ask 时会通过共享 `pi.events` 总线广播 `permissions:ui_prompt` 事件（见 `src/permission-events.ts`）。该事件在 Pi 内置权限确认框弹出**之前**触发。

### 数据流

```
Pi 权限系统检测到 ask
    ↓
emit "permissions:ui_prompt" 到 pi.events
    ↓
my-bt 监听到事件
    ↓
playCategory(config, "warning")        → 播放 BT 声音
playOverlay(config, "permissions:ui_prompt", EXT_DIR) → mac-overlay 弹窗
    ↓
Pi 内置权限确认框继续弹出（不受影响）
```

### 修改范围

只改 `pi-extensions/my-bt/` 目录下的 3 个文件 + 1 个配置：

| 文件 | 改动 |
|------|------|
| `my-bt.json` | 新增 `permissionEventMap` 和 `permissions:ui_prompt` 的 overlay 文案 |
| `types.ts` | `BtConfig` 新增 `permissionEventMap?: Record<string, string>` |
| `player.ts` | `EVENT_COLOR_MAP` 新增 `permissions_ui_prompt: "red"` |
| `index.ts` | 新增 `pi.events.on("permissions:ui_prompt", ...)` 订阅逻辑 |

### 配置示例（`my-bt.json`）

```json
{
  "permissionEventMap": {
    "permissions:ui_prompt": "warning"
  },
  "overlayTextMap": {
    "permissions:ui_prompt": {
      "type": "WARNING",
      "title": "侦测到危险操作",
      "subtitle": "铁御，请确认权限"
    }
  }
}
```

### 注意事项

- BT 弹窗和声音是**纯提醒**，不拦截权限流程
- 如果 `config.enabled` 为 `false`，不触发
- 使用现有 `playCategory` 和 `playOverlay` 函数，不引入新依赖
