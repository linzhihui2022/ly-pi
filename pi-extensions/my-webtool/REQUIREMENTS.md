# my-webtool 需求文档

> 状态：已确认，可作为开发基准
> 确认日期：2026-06-04
> 设计文档：[`SPEC.md`](./SPEC.md)

## 目标

提供本地 Pi 网页工具扩展，注册 `web_search` 和 `web_fetch` 两个工具，通过 Tavily 完成网页搜索与网页内容提取，并为后续 provider 扩展保留接口边界。

## 功能需求

### `web_search`

1. 通过 Tavily API 搜索网页。
2. 返回标题、URL、摘要组成的结果列表。
3. 支持 `max_results` 参数，取值范围为 1-10，默认值为 5。
4. 结果为空时返回明确提示。
5. Tavily 未启用或搜索失败时返回可读错误，不抛出未处理异常。

### `web_fetch`

1. 通过 Tavily API 提取指定 URL 的文本内容。
2. 支持 `raw` 参数：
   - `raw=false`：默认模式，使用 Tavily `/extract` 获取纯文本。
   - `raw=true`：直接 HTTP GET 目标 URL，返回原始 HTML。
3. 内容过大时自动截断，完整内容写入临时文件，并在结果中返回路径。
4. Tavily 未启用或抓取失败时返回可读错误，不抛出未处理异常。

### Provider 边界

1. 定义 `SearchProvider` 和 `FetchProvider` 接口。
2. Tavily 是当前唯一 provider 实现。
3. `index.ts` 通过接口调用 provider，不直接依赖 Tavily 的内部实现细节。
4. `config.ts` 和 `my-webtool.json` 仅作为配置预留；当前不要求提供完整配置系统。

### 工具元数据与渲染

1. 注册 `promptSnippet` 和 `promptGuidelines`，让 LLM 明确知道何时使用搜索/抓取工具。
2. `renderCall` 和 `renderResult` 需要提供简洁的 TUI 展示。
3. 搜索和抓取结果需要在 `details` 中保留结构化字段，便于调试和后续处理。

## 非功能需求

1. 扩展遵循 TDD 流程。
2. 测试覆盖 `helper.ts`、`render.ts`、Tavily provider、工具注册和执行逻辑。
3. 覆盖率要求：branches/functions/lines/statements 全部 100%。
4. 覆盖率排除项：`types.ts`（纯类型）和 `index.ts`（集成入口）。
5. 构建命令：`bunx turbo run build`。
6. 测试命令：`bunx turbo run test` 或在扩展目录执行 `bun test`/`vitest run`。

## 不做什么

| 功能 | 排除原因 |
|------|----------|
| 实现 SearxNG、DuckDuckGo 等多后端 | 当前只需要 Tavily，接口已预留 |
| 完整配置文件读取与热重载 | 当前仅保留 `config.ts` 和 `my-webtool.json` 占位 |
| 搜索结果缓存 | 超出当前范围 |
| 用户自定义 `promptGuidelines` | 超出当前范围 |
| 域名过滤配置 | 超出当前范围 |

## 验收标准

1. `web_search` 能在 Tavily 可用时返回结构化搜索结果。
2. `web_fetch` 能分别处理提取文本和 raw HTML 两种模式。
3. Tavily 未配置、额度不足、HTTP 非 200、解析失败等路径都有明确错误结果。
4. 大内容截断时返回截断说明和完整内容临时文件路径。
5. 单元测试和覆盖率检查通过。
