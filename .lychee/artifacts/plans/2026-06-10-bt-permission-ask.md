# BT-7274 权限 Ask 氛围提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当 `@gotgenes/pi-permission-system` 触发 ask 时，BT-7274 播放声音并显示 mac-overlay 弹窗作为氛围提醒。

**Architecture:** 订阅 `pi.events` 的 `permissions:ui_prompt` 事件，收到时调用现有 `playCategory()` 和 `playOverlay()` 函数。不拦截权限流程，纯提醒。

**Tech Stack:** TypeScript, Pi Extension API, `@gotgenes/pi-permission-system` event bus, vitest (TDD)

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `pi-extensions/my-bt/types.ts` | 扩展 `BtConfig` 接口，新增 `permissionEventMap` |
| `pi-extensions/my-bt/player.ts` | 扩展 `EVENT_COLOR_MAP`，新增 `permissions_ui_prompt: "red"` |
| `pi-extensions/my-bt/index.ts` | 新增 `pi.events.on("permissions:ui_prompt", ...)` 订阅逻辑 |
| `pi-extensions/my-bt/index.test.ts` | 新增事件订阅和播放行为的测试 |
| `pi-extensions/my-bt/player.test.ts` | 新增颜色映射的测试 |
| `pi-extensions/my-bt/my-bt.json` | 新增 `permissionEventMap` 和 `permissions:ui_prompt` 的 overlay 文案 |

---

### Task 1: 更新类型定义（types.ts）

**Files:**
- Modify: `pi-extensions/my-bt/types.ts`
- Test: `pi-extensions/my-bt/player.test.ts`（现有测试中 `BtConfig` 类型需要编译通过）

- [ ] **Step 1: 在 `BtConfig` 中新增 `permissionEventMap`**

```typescript
export interface BtConfig {
  enabled: boolean;
  soundDir: string;
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;
  /** Maps permission event names (e.g. "permissions:ui_prompt") to sound categories */
  permissionEventMap?: Record<string, string>;
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
```

- [ ] **Step 2: 验证现有测试编译通过**

Run: `cd pi-extensions/my-bt && bunx vitest run player.test.ts --reporter=verbose`
Expected: PASS（类型变更不应破坏现有测试）

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/types.ts
git commit -m "feat(bt): add permissionEventMap to BtConfig types"
```

---

### Task 2: 更新颜色映射（player.ts）

**Files:**
- Modify: `pi-extensions/my-bt/player.ts`
- Test: `pi-extensions/my-bt/player.test.ts`

- [ ] **Step 1: 写测试（先确认失败）**

在 `player.test.ts` 的 `describe("playOverlay", () => { ... })` 中新增：

```typescript
it("uses red color for permissions_ui_prompt", () => {
  const configWithPermissionOverlay: BtConfig = {
    ...mockConfig,
    overlayTextMap: {
      permissions_ui_prompt: { type: "WARNING", title: "侦测到危险操作", subtitle: "铁御，请确认权限" },
    },
  };
  playOverlay(configWithPermissionOverlay, "permissions_ui_prompt", extDir);
  const lastCall = vi.mocked(exec).mock.calls.at(-1);
  const cmd = lastCall![0] as string;
  expect(cmd).toContain("red");
  expect(cmd).toContain("WARNING");
  expect(cmd).toContain("侦测到危险操作");
  expect(cmd).toContain("铁御，请确认权限");
});
```

Run: `cd pi-extensions/my-bt && bunx vitest run player.test.ts::"uses red color for permissions_ui_prompt" -v`
Expected: FAIL（`EVENT_COLOR_MAP` 中还没有 `permissions_ui_prompt`）

- [ ] **Step 2: 在 `EVENT_COLOR_MAP` 中新增 `permissions_ui_prompt`**

修改 `pi-extensions/my-bt/player.ts` 中的 `EVENT_COLOR_MAP`：

```typescript
const EVENT_COLOR_MAP: Record<string, OverlayColor> = {
  session_start: "blue",
  agent_start: "orange",
  agent_end: "green",
  permissions_ui_prompt: "red",
};
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd pi-extensions/my-bt && bunx vitest run player.test.ts::"uses red color for permissions_ui_prompt" -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-bt/player.ts pi-extensions/my-bt/player.test.ts
git commit -m "feat(bt): add red color mapping for permission ui prompt overlay"
```

---

### Task 3: 实现事件订阅逻辑（index.ts）

**Files:**
- Modify: `pi-extensions/my-bt/index.ts`
- Test: `pi-extensions/my-bt/index.test.ts`

- [ ] **Step 1: 更新 mockPi 以支持 events**

在 `index.test.ts` 中，现有 `mockPi` 缺少 `events` 属性。新增：

```typescript
const mockEvents = {
  on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    registeredPermissionEvents.set(channel, handler);
  }),
  emit: vi.fn(),
};

const registeredPermissionEvents = new Map<string, (...args: any[]) => any>();

const mockPi = {
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    registeredEvents.set(event, handler);
  }),
  registerCommand: vi.fn((name: string, opts: any) => {
    registeredCommands.set(name, opts);
  }),
  events: mockEvents,
};
```

同时在 `beforeEach` 中清除 `registeredPermissionEvents` 和 `mockEvents.on.mockClear`。

- [ ] **Step 2: 写测试（先确认失败）**

在 `index.test.ts` 中新增测试（放在 overlay integration tests 之后）：

```typescript
// ── Permission event integration tests ──

it("subscribes to permissions:ui_prompt via pi.events", async () => {
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
  const mod = await loadModule();
  mod.default(mockPi as any);
  expect(mockEvents.on).toHaveBeenCalledWith(
    "permissions:ui_prompt",
    expect.any(Function),
  );
});

it("plays sound and overlay on permissions:ui_prompt when enabled", async () => {
  const configWithPermission = {
    ...DEFAULT_CONFIG,
    permissionEventMap: {
      "permissions:ui_prompt": "warning",
    },
    overlayTextMap: {
      permissions_ui_prompt: { type: "WARNING", title: "侦测到危险操作", subtitle: "铁御，请确认权限" },
    },
  };
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithPermission));
  const mod = await loadModule();
  mod.default(mockPi as any);

  const handler = registeredPermissionEvents.get("permissions:ui_prompt");
  handler?.({ requestId: "req-1", source: "tool_call", surface: "bash", value: "rm -rf *", message: "Dangerous command", agentName: null, forwarding: null });

  expect(playCategory).toHaveBeenCalledWith(
    expect.objectContaining({ permissionEventMap: expect.any(Object) }),
    "warning",
  );
  expect(playOverlay).toHaveBeenCalledWith(
    expect.objectContaining({ overlayTextMap: expect.any(Object) }),
    "permissions_ui_prompt",
    expect.any(String),
  );
});

it("does not play on permissions:ui_prompt when disabled", async () => {
  const configWithPermission = {
    ...DEFAULT_CONFIG,
    enabled: false,
    permissionEventMap: {
      "permissions:ui_prompt": "warning",
    },
  };
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(configWithPermission));
  const mod = await loadModule();
  mod.default(mockPi as any);

  const handler = registeredPermissionEvents.get("permissions:ui_prompt");
  handler?.({ requestId: "req-1", source: "tool_call", surface: "bash", value: "rm -rf *", message: "Dangerous command", agentName: null, forwarding: null });

  expect(playCategory).not.toHaveBeenCalled();
  expect(playOverlay).not.toHaveBeenCalled();
});

it("does not play on permissions:ui_prompt when permissionEventMap is missing", async () => {
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify(DEFAULT_CONFIG));
  const mod = await loadModule();
  mod.default(mockPi as any);

  const handler = registeredPermissionEvents.get("permissions:ui_prompt");
  handler?.({ requestId: "req-1", source: "tool_call", surface: "bash", value: "rm -rf *", message: "Dangerous command", agentName: null, forwarding: null });

  expect(playCategory).not.toHaveBeenCalled();
  expect(playOverlay).not.toHaveBeenCalled();
});
```

Run: `cd pi-extensions/my-bt && bunx vitest run index.test.ts::"subscribes to permissions:ui_prompt via pi.events" -v`
Expected: FAIL（index.ts 还没有订阅权限事件）

- [ ] **Step 3: 实现 `pi.events.on("permissions:ui_prompt", ...)`**

在 `pi-extensions/my-bt/index.ts` 中，在现有事件循环之后、命令注册之前新增：

```typescript
// ── Permission event-driven playback ──

if (config.permissionEventMap) {
  pi.events?.on("permissions:ui_prompt", () => {
    if (!config.enabled) return;
    const category = config.permissionEventMap?.["permissions:ui_prompt"];
    if (!category) return;
    playCategory(config, category);
    playOverlay(config, "permissions_ui_prompt", EXT_DIR);
  });
}
```

注意：事件名从 `permissions:ui_prompt`（bus 事件名）转换为 `permissions_ui_prompt`（overlay key，因为 overlayTextMap 的 key 不能包含 `:`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd pi-extensions/my-bt && bunx vitest run index.test.ts --reporter=verbose`
Expected: 全部 PASS（包括新增和现有测试）

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-bt/index.ts pi-extensions/my-bt/index.test.ts
git commit -m "feat(bt): subscribe to permissions:ui_prompt for BT alert"
```

---

### Task 4: 更新配置文件（my-bt.json）

**Files:**
- Modify: `pi-extensions/my-bt/my-bt.json`

- [ ] **Step 1: 新增 `permissionEventMap` 和 `permissions_ui_prompt` overlay 文案**

在 `pi-extensions/my-bt/my-bt.json` 的 `eventMap` 之后、`overlayTextMap` 之前新增：

```json
  "permissionEventMap": {
    "permissions:ui_prompt": "warning"
  },
```

在 `overlayTextMap` 中新增：

```json
    "permissions_ui_prompt": {
      "type": "WARNING",
      "title": "侦测到危险操作",
      "subtitle": "铁御，请确认权限"
    },
```

完整 `overlayTextMap` 应变为：

```json
  "overlayTextMap": {
    "session_start": {
      "type": "SESSION START",
      "title": "BT-7274 已上线",
      "subtitle": "主要系统重启完成"
    },
    "agent_start": {
      "type": "MISSION",
      "title": "执行任务中",
      "subtitle": "将控制转给铁御"
    },
    "agent_end": {
      "type": "COMPLETE",
      "title": "任务完成",
      "subtitle": "做得好，铁御"
    },
    "permissions_ui_prompt": {
      "type": "WARNING",
      "title": "侦测到危险操作",
      "subtitle": "铁御，请确认权限"
    }
  }
```

- [ ] **Step 2: 验证 JSON 格式正确**

Run: `cd pi-extensions/my-bt && bun -e "JSON.parse(require('fs').readFileSync('my-bt.json', 'utf-8')); console.log('JSON valid')"`
Expected: `JSON valid`

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/my-bt.json
git commit -m "config(bt): add permission ask overlay and warning sound"
```

---

### Task 5: 全量测试 + 覆盖率检查

**Files:**
- Test: `pi-extensions/my-bt/index.test.ts`, `pi-extensions/my-bt/player.test.ts`

- [ ] **Step 1: 运行全量测试**

Run: `cd pi-extensions/my-bt && bunx vitest run --reporter=verbose`
Expected: 全部 PASS，branches/functions/lines/statements 全部 100%

- [ ] **Step 2: 如果覆盖率不达标，补充测试**

常见缺口：
- `pi.events` 为 `undefined` 时的防御（`pi.events?.on` 已处理）
- `config.permissionEventMap` 存在但 `permissions:ui_prompt` 键缺失（已测试）

- [ ] **Step 3: Commit**

```bash
git add pi-extensions/my-bt/
git commit -m "test(bt): cover permission ask alert with 100% coverage"
```

---

### Task 6: 部署验证

**Files:**
- Deploy: `pi-extensions/my-bt/`

- [ ] **Step 1: 构建并部署**

Run: `bun run deploy`
Expected: 成功，无错误

- [ ] **Step 2: 热重载验证**

在 Pi 中执行 `/reload`
Expected: 扩展加载成功

- [ ] **Step 3: 手动测试（可选，交互式验证）**

触发一个被配置为 `"ask"` 的命令（如 `rm -rf something`），确认：
1. BT 警告声音播放
2. mac-overlay 红色弹窗显示
3. Pi 内置权限确认框正常弹出

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 监听 `permissions:ui_prompt` 事件 → Task 3
- [x] 播放 BT 声音 → Task 3 (playCategory)
- [x] 显示 mac-overlay 弹窗 → Task 3 (playOverlay)
- [x] 不拦截权限流程 → 事件监听器不返回任何值，纯副作用
- [x] `config.enabled` 控制 → Task 3 测试中覆盖
- [x] 配置驱动（permissionEventMap + overlayTextMap）→ Task 1, 4

**2. Placeholder scan:** 无 TBD、TODO、"implement later"

**3. Type consistency:**
- `permissionEventMap?: Record<string, string>` 在 types.ts, index.ts, index.test.ts, my-bt.json 中一致
- overlay key 使用 `permissions_ui_prompt`（下划线）而非 `permissions:ui_prompt`（冒号），与 `EVENT_COLOR_MAP` 和 `overlayTextMap` 保持一致
