# my-webtool usage command design spec

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-04

---

## 1. 项目背景

`my-webtool` 是 pi 的扩展，提供 `web_search` 和 `web_fetch` 两个工具，后端使用 Tavily API。当前已具备 Provider 接口抽象，Tavily 类实现了 `SearchProvider` 和 `FetchProvider`。

本次需求：新增一个 slash 命令 `/webtool-usage`，供用户查看 Tavily 的用量信息。

---

## 2. 设计决策

- **仅 slash 命令**：用户明确选择不注册为 LLM 工具，仅作为手动命令使用
- **简洁通知**：`ctx.ui.notify()` 输出一行文本，不展开 widget
- **接口化扩展**：新增 `UsageProvider` 接口，Tavily 实现它，保持现有架构一致性
- **纯函数渲染**：格式化逻辑放入 `render.ts`，可独立测试

---

## 3. 模块变更

### 3.1 `types.ts`

新增：

```typescript
export interface UsageResponse {
  ok: true;
  key: { usage: number; limit: number; remaining: number };
  plan: { usage: number; limit: number; remaining: number };
  features: Record<string, { usage: number; limit: number }>;
}

export interface UsageProvider {
  readonly name: string;
  readonly label: string;
  usage(): Promise<UsageResponse | { ok: false; error: string }>;
}
```

### 3.2 `backends/tavily.ts`

- 把 `private async usage()` 改为 `async usage(): Promise<UsageResponse | { ok: false; error: string }>`
- 返回结构标准化为 `UsageResponse`
- `remaining = limit - usage` 在返回前计算

### 3.3 `render.ts`

新增纯函数：

```typescript
export function formatUsageNotify(
  response: UsageResponse,
  label: string
): string {
  const key = response.key;
  const plan = response.plan;
  return `${label}: key ${key.usage}/${key.limit} used (${key.remaining} remaining); plan ${plan.usage}/${plan.limit} used (${plan.remaining} remaining)`;
}
```

### 3.4 `index.ts`

在 `myWebtool()` 中注册命令：

```typescript
pi.registerCommand("webtool-usage", {
  description: "Show Tavily usage statistics",
  handler: async (_args, ctx) => {
    const usage = await tavily.usage();
    if (!usage.ok) {
      ctx.ui.notify(`Usage check failed: ${usage.error}`, "error");
      return;
    }
    const text = formatUsageNotify(usage, tavily.label);
    ctx.ui.notify(text, "info");
  },
});
```

---

## 4. 测试

- `tavily.test.ts`：覆盖 `Tavily.usage()` 成功/失败路径
- `render.test.ts`：覆盖 `formatUsageNotify` 格式化输出

---

## 5. 排除范围

| 功能 | 排除原因 |
|------|----------|
| LLM 工具 `webtool_usage` | 用户明确选择仅 slash 命令 |
| Widget 面板 | 用户选择简洁通知 |
| 多后端 usage 聚合 | 当前只有 Tavily，未来扩展时统一处理 |
| 定时自动刷新 | 超出本次需求范围 |

---

## 6. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-04 | 新增 `/webtool-usage` slash 命令设计 |
