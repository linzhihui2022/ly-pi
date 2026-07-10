# my-webtool Spec

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-04  
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

提供本地 Pi 网页工具扩展，注册 `web_search` 与 `web_fetch` 两个工具，通过 Tavily 完成网页搜索与内容提取，并为后续接入其他 provider 预留接口边界。

## 2. 模块结构

```
pi-extensions/my-webtool/
├── index.ts            # 扩展入口：注册工具、命令、provider 实例
├── types.ts            # 共享类型与 SearchProvider / FetchProvider 接口
├── helper.ts           # 搜索数量限制、截断、临时文件等工具函数
├── render.ts           # 工具结果格式化与 TUI 渲染辅助
├── config.ts           # 配置占位（预留热重载配置）
├── backends/
│   └── tavily.ts       # Tavily provider 实现
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── my-webtool.json     # 配置占位
├── SPEC.md             # 本文档
└── REQUIREMENTS.md     # 需求清单
```

依赖方向：

```
index.ts → backends/tavily.ts
        → render.ts
        → helper.ts
        → config.ts
        → types.ts
```

## 3. Provider 接口

### 3.1 SearchProvider

```ts
interface SearchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResponse>;
}
```

### 3.2 FetchProvider

```ts
interface FetchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  fetch(url: string, raw: boolean, signal?: AbortSignal): Promise<FetchResponse>;
}
```

### 3.3 当前实现

- Tavily 是唯一的 SearchProvider / FetchProvider 实现。
- `index.ts` 通过接口调用 provider，不直接依赖 Tavily 内部实现细节。
- 启动时调用 `provider.check()` 异步检测是否启用；后续工具调用依据该状态决定继续执行或返回可读错误。

## 4. 工具定义

### 4.1 `web_search`

- **名称**：`web_search`
- **label**：`Web Search`
- **执行模式**：`parallel`
- **参数**：
  - `query`（string）：搜索查询，应使用自然语言且具体。
  - `max_results`（可选 number）：返回结果数量，范围 1–10，默认 5。
- **返回**：
  - 成功：content 为人类可读结果列表，details 包含 `query`、`backend`、`resultCount`、`results`。
  - 结果为空：返回明确提示和 `resultCount: 0`。
  - Tavily 未启用或失败：返回可读错误，不抛异常。

### 4.2 `web_fetch`

- **名称**：`web_fetch`
- **label**：`Web Fetch`
- **执行模式**：`parallel`
- **参数**：
  - `url`（string）：待抓取的 URL，仅支持 http/https。
  - `raw`（可选 boolean）：`true` 返回原始 HTML，`false` 返回提取后纯文本，默认 `false`。
- **返回**：
  - 成功：content 包含抓取内容，details 包含 `url`、`contentType`、`title`、可选 `truncation` 与 `fullOutputPath`。
  - 内容过大：截断后写入临时文件，返回截断说明与完整路径。
  - Tavily 未启用或失败：返回可读错误，不抛异常。

## 5. 渲染

### 5.1 `renderCall`

- `web_search`：显示 `WebSearch "query"`。
- `web_fetch`：显示 `WebFetch url`。

### 5.2 `renderResult`

- 部分结果（`isPartial`）：显示 `Searching...` / `Fetching...`。
- 完整结果：显示结果数量或 `Fetched` 标题；展开时列出结果摘要。

## 6. 命令

### 6.1 `/webtool-usage`

- 功能：查询 Tavily 当前 key 与 plan 的用量和剩余额度。
- 成功：通过 `ctx.ui.setWidget` 与 `ctx.ui.notify` 展示用量。
- 失败：通知错误信息。

## 7. 配置

- `config.ts` 与 `my-webtool.json` 仅作为配置预留。
- 当前不要求完整配置系统、热重载或用户自定义 promptGuidelines。

## 8. 错误处理

- Tavily 未启用：工具返回可读文本与结构化 details 错误，不抛异常。
- HTTP 非 200 / 解析失败：返回错误结果。
- 内容过大：自动截断并 spill 到临时文件。

## 9. 测试策略

- `helper.ts`：纯函数单元测试。
- `render.ts`：格式化与渲染辅助函数测试。
- `backends/tavily.ts`：Tavily provider 搜索、抓取、错误路径测试。
- `index.ts`：集成测试，mock ExtensionAPI、provider 与 TUI。
- 覆盖率目标：branches / functions / lines / statements 全部 100%。
- 排除：`types.ts`（纯类型）和 `index.ts`（集成入口）不计入。

## 10. 不做什么

| 功能 | 排除原因 |
|------|----------|
| SearxNG、DuckDuckGo 等多后端 | 当前只需要 Tavily，接口已预留 |
| 完整配置文件读取与热重载 | 当前仅保留 `config.ts` 和 `my-webtool.json` 占位 |
| 搜索结果缓存 | 超出当前范围 |
| 用户自定义 `promptGuidelines` | 超出当前范围 |
| 域名过滤配置 | 超出当前范围 |

## 11. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-04 | 确认需求与 Tavily provider 接口 |
| 2026-07-10 | 将原外部设计文档展开到本 SPEC.md，补充模块、接口、工具、渲染、命令与测试策略 |
