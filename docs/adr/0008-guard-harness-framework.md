# Guard 框架：一个接口，多个适配器

`my-cd-guard` 和 `my-script-guard` 各自复制了相同的样板代码——`pi.on("tool_call")` 钩子注册、`isToolCallEventType("bash")` 事件过滤、扩展生命周期接线。新增第三个 guard 需要复制约 20 行样板，且 escalation 阈值逻辑无法复用。提取 `GuardHarness`，将 guard 的共性收敛到 harness，每个 guard 变成实现 `detect + react` 的适配器配置。

## GuardHarness：统一钩子 + 生命周期

harness 接管三个生命周期钩子，guards 按注册顺序依次执行：

```
bash 命令
  │
  ▼
GuardHarness（单一 tool_call 钩子）
  │
  ├─ 1. cd-guard.detect(cmd) → CdStripResult?
  │     └─ react: 原地改写 event.input.command + notify
  │
  ├─ 2. script-guard.detect(改写后 cmd) → GuardDetection?
  │     └─ react: 返回 ToolCallEventResult
  │           └─ harness 统一处理升级计数 + confirm
  │
  ▼
返回 ToolCallEventResult 或 undefined
```

harness 职责：
- 一次性注册 `pi.on("session_start")`、`pi.on("before_agent_start")`、`pi.on("tool_call")`
- 按序分发命令到各 guard 的 `detect`，命中后调用 `react`
- 统一管理升级计数器：超阈值后调用 `ctx.ui.confirm`，适配器只提供消息内容
- `react` 返回 `void` 视为"已静默处理"（cd-guard），返回 `ToolCallEventResult` 视为"拦截"；支持同步和异步
- `onBeforeAgentStart` 多 guard 链式合并：guard-1 的输出 `systemPrompt` 作为 guard-2 的输入，harness 将最终字符串包装为 `{ systemPrompt }` 返回给 pi

## GuardConfig 接口

```typescript
import type { BashToolCallEvent, ExtensionContext, ToolCallEventResult } from "@earendil-works/pi-coding-agent";

interface GuardConfig<TDet = unknown> {
  name: string;
  detect: (command: string, cwd: string) => TDet | undefined;
  react: (detection: TDet, event: BashToolCallEvent, ctx: ExtensionContext)
    => void | ToolCallEventResult | Promise<void | ToolCallEventResult>;

  // 可选生命周期钩子
  onSessionStart?: (cwd: string) => void;
  onBeforeAgentStart?: (systemPrompt: string, cwd: string) => string | undefined;

  // 可选升级配置（由 harness 驱动）
  escalation?: {
    threshold: number;
    buildConfirm: (detection: TDet, count: number) => { title: string; body: string };
  };
}
```

## 实现方案

### 文件结构

```
ly-pi/shared/guard-harness.ts   # 新增：harness 核心
ly-pi/my-cd-guard/index.ts      # 重写：导出 GuardConfig
ly-pi/my-cd-guard/detector.ts   # 不变
ly-pi/my-script-guard/index.ts  # 重写：导出 GuardConfig
ly-pi/my-script-guard/detector.ts # 不变
ly-pi/index.ts                  # 修改：用 harness 统一注册
```

### harness 与 ly-pi 集成

`ly-pi/index.ts` 是单体入口，直接导入 `createGuardHarness` 和各 guard 的 `GuardConfig`：

```typescript
import { createGuardHarness } from "./shared/guard-harness";
import { cdGuard } from "./my-cd-guard/index";
import { scriptGuard } from "./my-script-guard/index";

// createGuardHarness(pi: ExtensionAPI, guards: GuardConfig[]): void
export default function lyPi(pi: ExtensionAPI): void {
  createGuardHarness(pi, [cdGuard, scriptGuard]);
  // ... 其他扩展逻辑
}
```

harness 作为普通模块函数被调用，不是独立扩展。pi 事件钩子由 harness 内部注册，guards 不直接接触 `pi.on()`。

### 异常处理

guard 的 `detect` 或 `react` 抛异常时，harness catch 后静默跳过该 guard，继续处理后续 guards。单个 guard 出错不应阻断 bash 命令执行。错误通过 `console.warn` 输出，不向用户弹窗。

### escalation 类型透传

`buildConfirm(detection, count)` 的 `detection` 参数由 harness 透传——harness 内部以 `unknown` 持有，不做类型假设。Guards 通过泛型 `TDet` 约束自己的 detect 返回值和 buildConfirm 入参一致，类型安全由 GuardConfig 的泛型参数保证。

### 适配器迁移

两个现有 guard 的 index.ts 从"扩展入口函数"变为"导出 GuardConfig 对象"：

#### cd-guard：从 35 行 index.ts → GuardConfig 对象

- `detect` 委托 `stripRedundantCd(cmd, cwd, realpathSync)`
- `react` 改写 `event.input.command` + `ctx.ui.notify`
- `onBeforeAgentStart` 注入 cwd 提示词
- 无需 escalation（永不拦截）

#### script-guard：从 60 行 index.ts → GuardConfig 对象

- `detect` 委托 `detectInlineScript ?? detectFileWriteBypass`
- `react` 返回 `{ block: true, reason: buildReason(detection) }`（即 `ToolCallEventResult`）
- `escalation` 提供阈值 3 + confirm 消息构建器
- `buildReason`、`buildConfirmMessage` 保持为 detector.ts 的导出函数

## Considered Options

- **仅统一 tool_call 流水线，不纳入生命周期**：被拒绝。cd-guard 的 `onBeforeAgentStart` 提示词注入是 guard 职责的一部分，拆在外面会破坏 locality——guard 的完整行为仍分散在两处。
- **移除 `onSessionStart`——当前无 guard 使用**：被拒绝。虽然 cd-guard 改用 `onBeforeAgentStart(cwd)` 后不再需要会话级状态，但 session 钩子为未来 guard（如需要会话级初始化、配置文件热加载）保留扩展点。接口成本为零（可选方法），删了再加是 breaking change。
- **单个 `handle` 方法替代 `detect + react`**：被拒绝。检测和反应分离允许独立单元测试：`detect` 是纯函数可批量测试，`react` 测试副作用。合并后测试需要 mock 整个事件对象。
- **escalation 阈值放在适配器内部闭包**：被拒绝。阈值和计数逻辑是通用机制，放在 harness 层避免每个需要升级的适配器重复实现。cd-guard 不配置 escalation 即可。
- **渐进式迁移（先 script-guard，后 cd-guard）**：被拒绝。两个 guard 同时迁移改动量小（各约 20 行删除），中间态引入临时文件得不偿失。一步到位，一次提交。

## Consequences

- 新增第三个 guard（如危险 flag 检测器）只需实现 `detect + react`，无需触碰 harness 或 index.ts 的钩子注册逻辑。
- harness 测试覆盖一次即可验证所有 guard 的钩子注册、事件过滤、升级计数、confirm 流程；适配器只需测试 `detect` 和 `react` 的纯逻辑。
- 执行顺序变为显式：cd-guard 先改写命令，script-guard 检测改写后的命令。当前两个 guard 各自独立检测原始命令，但改写前后对脚本检测无实际影响（cd 前缀和脚本内容不重叠）。
- `GuardConfig` 的泛型 `TDet` 允许每个 guard 定义自己的检测结果类型，无需强制统一。
