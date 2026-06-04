# my-webtool 需求确认清单

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-04

---

## 我要什么

### 1. web_search — 网页搜索工具

- 通过 Tavily API 搜索网页
- 返回结果列表（标题、URL、摘要）
- 支持 `max_results` 参数（1-10，默认 5）
- 结果为空时返回明确提示
- 搜索失败时返回错误信息

### 2. web_fetch — 网页抓取工具

- 通过 Tavily API 提取指定 URL 的文本内容
- 支持 `raw` 参数：
  - `raw=false`（默认）→ 使用 Tavily /extract 获取纯文本
  - `raw=true` → 直接 HTTP GET 目标 URL，返回原始 HTML
- 内容过大时自动截断，超限部分写入临时文件
- 抓取失败时返回错误信息

### 3. Provider 接口抽象

- 定义 `SearchProvider` 和 `FetchProvider` 接口
- Tavily 作为唯一实现
- `index.ts` 通过接口调用，不直接依赖 Tavily 类
- 为未来扩展 SearxNG、DuckDuckGo 等后端预留位置

### 4. 代码优化

- 修正 `package.json` 包名为 `my-webtool`
- 删除 `run.ts` 调试脚本
- 修正 `promptGuidelines` 为静态字符串
- `execute` 运行时检查 provider 状态，返回明确错误
- 统一错误处理：`fetch` 非 200 时返回 `{ ok: false, error }`（不再 throw）
- 删除未使用的导入（`userInfo`）

### 5. 单元测试

- `helper.test.ts`：测试辅助函数
- `render.test.ts`：测试渲染函数
- `tavily.test.ts`：测试 Tavily 后端
- `index.test.ts`：测试工具注册和执行逻辑
- 覆盖率要求：branches/functions/lines/statements 全部 100%
- 排除：`types.ts`（纯类型）、`index.ts`（集成测试）

### 6. 文档

- `REQUIREMENTS.md`：本文件
- `SPEC.md`：指向设计文档

---

## 我不做什么（明确排除）

| 功能 | 排除原因 |
|------|----------|
| 实现多后端（SearxNG/DuckDuckGo） | 当前只需 Tavily，接口已预留 |
| 配置文件具体实现 | 预留 `my-webtool.json`，当前为空对象 |
| 搜索结果缓存 | 超出本次范围 |
| 用户自定义 promptGuidelines | 超出本次范围 |
| 域名过滤配置 | 超出本次范围 |

---

## 待实现清单

1. [ ] 重构目录结构，创建 `backends/` 目录
2. [ ] 提取 `types.ts`，定义 Provider 接口
3. [ ] 重构 `tavily.ts` 实现 Provider 接口
4. [ ] 优化 `index.ts`：静态 promptGuidelines、运行时检查、解耦 Tavily
5. [ ] 实现 `raw=true` 模式（直接 HTTP GET）
6. [ ] 优化 `render.ts` 和 `helper.ts`
7. [ ] 添加 `config.ts`（预留）
8. [ ] 添加 `helper.test.ts`
9. [ ] 添加 `render.test.ts`
10. [ ] 添加 `tavily.test.ts`
11. [ ] 添加 `index.test.ts`
12. [ ] 修正 `package.json`
13. [ ] 删除 `run.ts`
14. [ ] 验证覆盖率 100%
