# my-hud 内存压力与 vitest 泄漏检测设计

> 状态：已确认，待实现  
> 日期：2026-06-29

## 1. 目标

在 `my-hud` 扩展中增加系统内存压力检测：

1. 当物理内存使用率 ≥ 80% 时，在 aboveEditor 状态行显示红色内存警告。
2. 同时扫描当前是否存在 `node` 启动的 `vitest` 进程；如果存在，通过 `ctx.ui.notify()` 弹出 `warning` 级别通知，列出每个 vitest 进程的 PID 和内存占用。
3. 正常内存状态下不显示任何额外信息，避免干扰。

## 2. 触发 hook

- `agent_start` — 用户提交请求、agent 开始工作时
- `agent_end` — agent 处理完毕后

这两个 hook 频率适中，能覆盖 agent / 子代理 / CI 测试运行期间内存逐渐泄漏的场景。

## 3. 内存检测模块 `memory.ts`

职责单一：检测 macOS 物理内存压力。

```typescript
export interface MemoryStatus {
  percent: number; // 0-100
  ok: boolean;
}

export function checkMemoryPressure(): MemoryStatus;
```

实现要点：

- 调用 `vm_stat` 并解析页面计数。
- 计算已用内存 = `wired down + active + inactive`（页数 × 页大小）。
- 物理内存总量通过 `system_profiler SPHardwareDataType | grep Memory` 获取，或解析 `hw.memsize`。
- 使用率 = 已用内存 / 物理内存 × 100。
- 阈值 80%：≥ 80% 时 `ok: false`。
- 非 macOS 平台或解析失败时返回 `{ percent: 0, ok: true }`，静默兜底。

## 4. vitest 进程检测模块 `vitest-process.ts`

职责单一：扫描系统中的 vitest 进程。

```typescript
export interface VitestProcess {
  pid: number;
  rssBytes: number;
  command: string;
}

export function findVitestProcesses(): VitestProcess[];
```

实现要点：

- 调用 `ps -axo pid,command,rss`。
- 对每行解析：
  - `command` 包含 `node`（不区分大小写）
  - 且命令行参数包含 `vitest`
- 返回匹配进程的 PID 和 RSS（字节）。
- 解析失败返回空数组。

## 5. 渲染集成

### 5.1 数据模型

`StatusLineData` 增加：

```typescript
export interface StatusLineData {
  // ...existing fields
  memoryStatus?: MemoryStatus | null;
}
```

### 5.2 aboveEditor 状态行

`buildStatusLine()` 在状态行末尾追加内存字段：

- 当 `memoryStatus?.ok === false` 时：
  - 图标：`icon("warning")`（或新增 `memory` 图标）
  - 颜色：`theme.fg("error", ...)`
  - 文本：`mem 87%`
- 正常时该字段为空，不占用空间。

### 5.3 通知

在 `index.ts` 的 `agent_start` / `agent_end` handler 中：

1. 调用 `checkMemoryPressure()`。
2. 如果 `!ok`：
   - 调用 `findVitestProcesses()`。
   - 如果列表非空，构造通知文本并 `ctx.ui.notify(text, "warning")`。

通知示例：

```
⚠️ 内存压力 87%，发现 vitest 进程：44124 (1.2GB), 44126 (818MB)
```

为避免同一轮次重复弹通知，可记录最近一次通知状态，内存恢复正常后清除。

## 6. 事件流

```
agent_start / agent_end
  │
  ▼
index.ts handler
  ├── memory.ts: checkMemoryPressure()
  │     └── 内存 ≥ 80%?
  │
  ├── vitest-process.ts: findVitestProcesses()
  │     └── 有 vitest 进程?
  │
  ├── ctx.ui.notify(warningText, "warning")  (异常 + 有 vitest)
  │
  ├── bar.updateMemoryStatus(status)
  │     └── bar.requestRender()
  │
  ▼
widget render callback
  └── render.ts: buildStatusLine(..., memoryStatus)
        └── 异常时追加红色 mem 字段
```

## 7. 模块职责

| 模块 | 职责 |
|------|------|
| `memory.ts` | 解析 `vm_stat`，返回内存使用状态 |
| `vitest-process.ts` | 解析 `ps`，返回 vitest 进程列表 |
| `types.ts` | 新增 `MemoryStatus` 相关类型 |
| `bar.ts` | 持有 `memoryStatus`，驱动 widget 重绘 |
| `render.ts` | 纯函数：根据 `memoryStatus` 渲染状态行 |
| `index.ts` | 事件注册、状态检测、通知触发、数据流转 |

## 8. 测试策略

覆盖率目标：branches/functions/lines/statements 100%（符合仓库硬性要求）。

- `memory.test.ts`：
  - mock `vm_stat` 输出，验证使用率计算
  - 验证 80% 阈值
  - 验证解析失败时返回 `ok: true`

- `vitest-process.test.ts`：
  - mock `ps` 输出，验证 vitest 进程过滤
  - 验证 node + vitest 参数才被识别
  - 验证 RSS 解析与字节转换
  - 验证解析失败返回空数组

- `render.test.ts`：
  - 正常 `memoryStatus` 不渲染 mem 字段
  - 异常 `memoryStatus` 渲染红色 `mem 87%`

- `index.test.ts` / `bar.test.ts`：
  - 验证 `agent_start` / `agent_end` 触发检测
  - 验证内存异常时调用 `notify`（当有 vitest 进程）
  - 验证没有 vitest 进程时不弹通知
  - 验证内存正常时不渲染警告

## 9. 排除项

| 功能 | 排除原因 |
|------|----------|
| 自动杀进程 | 需求仅检测与通知，不自动操作 |
| 持久化历史状态 | 当前只需实时状态 |
| 可配置阈值 | 先硬编码 80%，后续有需求再加 |
| 非 macOS 支持 | 先解决当前 macOS 场景，其他平台静默兜底 |
| footer/working 显示 | 内存状态属于系统监控，放在 aboveEditor 统一展示 |
