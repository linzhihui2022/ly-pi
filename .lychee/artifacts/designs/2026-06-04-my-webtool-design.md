# my-webtool Design Spec

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-04

---

## 1. 项目背景

`my-webtool` 是 pi 的一个扩展，提供 `web_search` 和 `web_fetch` 两个工具：

- `web_search` — 通过 Tavily API 搜索网页，返回带标题、URL、摘要的结果列表
- `web_fetch` — 通过 Tavily API 提取指定 URL 的文本内容，支持截断和溢出到临时文件

当前代码存在以下问题：
- `package.json` 包名是 `my-hud`，与目录名不符
- 没有测试文件，覆盖率 0%
- 没有需求文档和设计规格
- `run.ts` 是临时调试脚本，不应留在代码库中
- `index.ts` 的 `promptGuidelines` 使用模板字符串在注册时就求值，永远是固定值
- `web_fetch` 的 `raw` 参数被完全忽略
- `index.ts` 与 Tavily 实现强耦合，不利于未来扩展其他后端

---

## 2. 设计哲学

- **一层一责**：每个模块有且只有一个职责，不越界
- **接口先行**：通过 Provider 接口将工具注册逻辑与具体后端实现解耦
- **纯函数优先**：渲染、格式化等逻辑做成纯函数，便于单元测试
- **YAGNI**：不提前实现未要求的功能，但为未来扩展预留明确位置

---

## 3. 模块职责划分

```
index.ts              — 扩展入口，注册工具、协调事件
                      — 职责：持有 provider 注册表，响应 session_start 初始化
                      — 禁止：直接访问 Tavily API

types.ts              — 共享类型 + Provider 接口定义
                      — 职责：类型声明，无运行时逻辑

render.ts             — 纯函数渲染器
                      — 职责：给定数据，返回格式化字符串或 Text 组件
                      — 禁止：调用副作用、访问全局状态

helper.ts             — 通用辅助函数
                      — 职责：搜索数量裁剪、临时文件写入等纯/副作用函数

config.ts             — 配置读取（预留）
                      — 职责：读取 my-webtool.json，支持热重载

backends/tavily.ts    — Tavily 实现
                      — 职责：实现 SearchProvider + FetchProvider 接口
                      — 禁止：感知 pi ExtensionAPI
```

**依赖方向**（必须单向）：

```
index.ts → backends/tavily.ts (通过接口)
         → render.ts
         → helper.ts
         → config.ts
         → types.ts
```

- `index.ts` 是唯一感知「事件」的模块
- `render.ts` 和 `helper.ts` 不依赖 `backends/tavily.ts`
- `backends/tavily.ts` 只依赖 `types.ts`

---

## 4. Provider 接口

```typescript
export interface SearchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  search(
    query: string,
    maxResults: number,
    signal?: AbortSignal
  ): Promise<SearchResponse>;
}

export interface FetchProvider {
  readonly name: string;
  readonly label: string;
  check(): Promise<{ enabled: boolean; message: string }>;
  fetch(
    url: string,
    raw: boolean,
    signal?: AbortSignal
  ): Promise<FetchResponse>;
}
```

`backends/tavily.ts` 中的 `Tavily` 类同时实现两个接口。`index.ts` 通过工厂函数获取 provider，不直接依赖 Tavily 类。

---

## 5. 目录结构

```
my-webtool/
├── index.ts              # 扩展入口
├── types.ts              # 共享类型 + Provider 接口
├── render.ts             # 纯函数渲染器
├── helper.ts             # 通用辅助函数
├── config.ts             # 配置读取（预留）
├── backends/
│   └── tavily.ts         # Tavily 实现
├── helper.test.ts        # helper.ts 单元测试
├── render.test.ts        # render.ts 单元测试
├── tavily.test.ts        # backends/tavily.ts 单元测试
├── index.test.ts         # index.ts 集成测试
├── REQUIREMENTS.md       # 需求确认清单
├── SPEC.md               # 本设计规格（从 .lychee/artifacts/designs/ 复制或软链接）
├── my-webtool.json       # 配置文件（预留）
└── package.json          # 包名修正为 my-webtool
```

---

## 6. 数据流

### 6.1 web_search 数据流

```
用户调用 web_search(query, max_results)
  │
  ▼
index.ts: execute()
  ├── clampSearchResultCount(params.max_results)
  ├── onUpdate({ searching... })
  ├── provider.search(query, maxResults, signal)
  │   │
  │   ▼
  │   Tavily.search() → POST /search → normalize results
  │
  ▼
  response.ok === false
    ├── buildEmptyResultsEnvelope(query, label, error)
    └── return
  response.results.length === 0
    ├── buildEmptyResultsEnvelope(query, label)
    └── return
  response.ok === true
    ├── formatSearchResultsBody(response)
    └── return { content, details }
```

### 6.2 web_fetch 数据流

```
用户调用 web_fetch(url, raw)
  │
  ▼
index.ts: execute()
  ├── onUpdate({ fetching... })
  ├── provider.fetch(url, raw, signal)
  │   │
  │   ▼
  │   Tavily.fetch() 内部判断 raw：
  │     raw === true
  │       ├── fetch(url) → 原始 HTTP GET
  │       └── return { text: rawHtml, contentType }
  │     raw === false
  │       ├── POST /extract → raw_content
  │       └── return { text: extractedText, contentType: "text/plain" }
  │
  ▼
  response.ok === false
    └── return { content: [{ text: error }], details: { url, error } }
  response.ok === true
    ├── truncateHead(bodyText, { maxLines, maxBytes })
    ├── truncation.truncated → spillFullContentToTempFile(bodyText)
    ├── formatFetchHeader(url, contentType) + output + truncationFooter
    └── return { content, details: { url, contentType, truncation, fullOutputPath } }
```

---

## 7. 关键修复清单

| # | 问题 | 修复方案 |
|---|------|----------|
| 1 | `package.json` 包名是 `my-hud` | 改为 `my-webtool` |
| 2 | 没有测试文件 | 添加 `helper.test.ts`、`render.test.ts`、`tavily.test.ts`、`index.test.ts` |
| 3 | 没有需求/设计文档 | 添加 `REQUIREMENTS.md` 和本设计文档 |
| 4 | `run.ts` 调试脚本残留 | **删除** |
| 5 | `promptGuidelines` 模板字符串注册时求值 | 改为静态字符串，运行时检查由 `execute` 完成 |
| 6 | `web_fetch` 的 `raw` 参数被忽略 | **raw=true 时直接 HTTP GET 目标 URL，返回原始 HTML** |
| 7 | `index.ts` 与 Tavily 强耦合 | 通过 Provider 接口解耦 |
| 8 | `tavily.ts` 中 `fetch` 非 200 时 throw Error | 改为返回 `{ ok: false, error }`，与 `search` 行为一致 |
| 9 | `tavily.ts` 中未使用 `import { userInfo }` | **删除** |

---

## 8. 测试策略

### 覆盖率要求

branches/functions/lines/statements **全部 100%**。

排除项：`types.ts`（纯类型）、`index.ts`（集成测试）。

### 测试文件分配

| 文件 | 测试内容 |
|------|----------|
| `helper.test.ts` | `clampSearchResultCount` 边界值、`spillFullContentToTempFile` 写入行为 |
| `render.test.ts` | `buildEmptyResultsEnvelope`、`formatSearchResultsBody`、`formatTruncationFooter`、`formatFetchHeader`、`renderSearchResultsPreview`、`renderFetchedContentPreview` |
| `tavily.test.ts` | `normalizeTavilyResults`、`Tavily.check`、`Tavily.search`、`Tavily.fetch`，mock 全局 `fetch` |
| `index.test.ts` | 工具注册、事件回调（session_start）、renderCall/renderResult、execute 成功/失败路径 |

### Mock 策略

- `tavily.test.ts`：mock 全局 `fetch`，模拟各种 HTTP 响应
- `index.test.ts`：mock `backends/tavily`，使用 mock provider 测试工具注册逻辑
- `render.test.ts` / `helper.test.ts`：无需外部依赖 mock

---

## 9. 配置文件（预留）

`my-webtool.json` 与扩展目录同级，当前为空对象 `{}`，为未来以下需求预留：

| 配置项 | 用途 |
|--------|------|
| `defaultSearchProvider` | 默认搜索后端 |
| `defaultFetchProvider` | 默认抓取后端 |
| `maxResults` | 覆盖默认搜索返回数量 |
| `timeout` | 请求超时设置 |
| `includeDomains` / `excludeDomains` | 域名过滤 |

配置支持热重载（通过 `/reload` 时重新读取）。

---

## 10. 扩展点（未来需求着陆区）

| 需求方向 | 建议方案 | 备注 |
|----------|----------|------|
| 添加 SearxNG/DuckDuckGo 后端 | 实现 `SearchProvider` 接口 | 在 `backends/` 下新增文件 |
| 添加自定义 fetch 后端 | 实现 `FetchProvider` 接口 | 如 `curl` 模式、代理模式 |
| 搜索结果缓存 | `helper.ts` 新增缓存层 | TTL 控制 |
| 用户自定义 promptGuidelines | `config.ts` 读取配置项 | 覆盖默认 guidelines |

---

## 11. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-04 | 整理现有代码，设计 Provider 接口，生成本 spec |
