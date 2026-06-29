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

### 5.2 aboveEditor 内存警告 widget

新增一个独立的 `aboveEditor` widget，与现有 my-hud 状态行分离。

- widget 仅在内存异常时显示；正常时通过 `setWidget(key, undefined)` 移除。
- 内容格式（单行紧凑）：
  ```
  ⚠️ 内存 87% · vitest 44124(1.2GB), 44126(818MB)
  ```
- 整行使用 `theme.fg("error", ...)` 红色渲染。
- vitest 信息来自 `findVitestProcesses()`，按 PID 升序排列后格式化为 `pid(rss)`。

### 5.3 渲染流程

在 `index.ts` 的 `agent_start` / `agent_end` handler 中：

1. 调用 `checkMemoryPressure()`。
2. 如果 `!ok`：
   - 调用 `findVitestProcesses()`。
   - 构造 widget 文本并 `ctx.ui.setWidget(MEMORY_WIDGET_KEY, ...)`。
3. 如果 `ok`：
   - 调用 `ctx.ui.setWidget(MEMORY_WIDGET_KEY, undefined)` 隐藏 widget。

不做去重：每次 hook 都调用 `setWidget`，内容无变化时只是无害重绘。

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
  │     └── 收集 vitest PID + RSS
  │
  ├── ctx.ui.setWidget(MEMORY_WIDGET_KEY, renderFn)
  │     └── 异常时显示红色警告 widget
  │
  └── 内存正常时：ctx.ui.setWidget(MEMORY_WIDGET_KEY, undefined)
```

## 7. 模块职责

| 模块 | 职责 |
|------|------|
| `memory.ts` | 解析 `vm_stat`，返回内存使用状态 |
| `vitest-process.ts` | 解析 `ps`，返回 vitest 进程列表 |
| `types.ts` | 新增 `MemoryStatus` 与 `VitestProcess` 类型 |
| `memory-widget.ts` | 纯函数：构造内存警告 widget 文本 |
| `index.ts` | 事件注册、内存检测、vitest 扫描、widget 显隐控制 |

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

- `memory-widget.test.ts`：
  - 验证内存异常 + 无 vitest 时 widget 文本
  - 验证内存异常 + 有 vitest 时格式 `⚠️ 内存 87% · vitest 44124(1.2GB), 44126(818MB)`
  - 验证内存正常时不返回内容

- `index.test.ts`：
  - 验证 `agent_start` / `agent_end` 触发内存检测
  - 验证内存异常时设置 widget、正常时隐藏 widget
  - 验证 widget 内容包含内存压力和 vitest 进程信息

## 9. 排除项

| 功能 | 排除原因 |
|------|----------|
| 自动杀进程 | 需求仅检测与通知，不自动操作 |
| 持久化历史状态 | 当前只需实时状态 |
| 可配置阈值 | 先硬编码 80%，后续有需求再加 |
| 非 macOS 支持 | 先解决当前 macOS 场景，其他平台静默兜底 |
| footer/working 显示 | 内存状态属于系统监控，放在 aboveEditor 统一展示 |
| notify 弹窗 | 已改为 widget 展示，避免通知堆叠 |
