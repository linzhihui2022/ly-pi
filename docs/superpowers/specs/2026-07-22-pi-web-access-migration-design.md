# pi-web-access 全面迁移设计

> 状态：已确认
> 日期：2026-07-22
> 目标：使用 `npm:pi-web-access` 全面替代本地 `my-webtool` 扩展

## 1. 背景

仓库当前通过 `pi-extensions/my-webtool/` 自行维护 `web_search`、`web_fetch` 与 `/webtool-usage`，运行时部署到 `~/.pi/agent/extensions/my-webtool/`。第三方 Pi 包 `pi-web-access` 提供更完整的网页搜索和内容提取能力，并由 Pi 包管理器独立维护。

本次迁移采用 `pi-web-access` 的原生接口，不保留本地兼容层：

- 保留工具名 `web_search`。
- 将 `web_fetch` 全面迁移为 `fetch_content`。
- 引入 `get_search_content` 读取搜索或抓取过程中保存的完整内容。
- 移除 `/webtool-usage`，不提供替代命令。

## 2. 已确认决策

1. 安装未固定版本的 `npm:pi-web-access`，允许 `pi update` 跟随上游更新。
2. 完整删除本地 `my-webtool` 源码、测试、构建配置和部署副本。
3. 默认搜索 provider 使用 `auto`，现有 Tavily 凭证作为 fallback。
4. 默认工作流使用 `none`，不打开 curator，保持主会话与子代理的非交互式搜索行为。
5. 显式禁用浏览器 Cookie 读取。
6. 不安装可选的 `ffmpeg` 或 `yt-dlp`。
7. Pi 包继续由 Pi 包管理器维护，不把 `packages` 数组写入仓库的 `settings/settings.json`。
8. `pi-web-access` 自带的 `librarian` skill 从 npm 包目录加载，不复制到仓库或 `~/.pi/agent/skills/`；仓库自有技能数量仍为 6。

## 3. 架构与组件变更

### 3.1 运行时归属

迁移后，网页访问能力的运行时来源为：

```text
~/.pi/agent/settings.json
└── packages[] includes "npm:pi-web-access"

~/.pi/agent/npm/node_modules/pi-web-access/
├── index.ts
└── skills/librarian/SKILL.md
```

仓库的 `settings/scripts/deploy.ts` 继续只递归合并仓库设置，不管理 `packages` 数组，避免覆盖用户已安装的其他 Pi 包。

### 3.2 删除本地扩展

删除整个目录：

```text
pi-extensions/my-webtool/
```

同时移除已部署副本：

```text
~/.pi/agent/extensions/my-webtool/
```

删除旧部署必须发生在启动新的 Pi 验证进程之前，避免本地扩展与 npm 包同时注册 `web_search`。

### 3.3 调用方迁移

| 调用方 | 变更 |
|---|---|
| `pi-agents/researcher.md` | 工具列表改为 `web_search`、`fetch_content`、`get_search_content` |
| `pi-skills/skills/web-search-researcher/SKILL.md` | 抓取步骤改用 `fetch_content`；长内容按 `responseId` 使用 `get_search_content` |
| `pi-extensions/my-todo/index.ts` | Plan 模式允许列表移除 `web_fetch`，加入 `fetch_content` 与 `get_search_content` |
| `pi-extensions/my-todo/index.test.ts` | 先更新期望并确认失败，再修改实现使测试通过 |
| `pi-extensions/my-todo/REQUIREMENTS.md` | 同步 Plan 模式可用工具需求 |
| `pi-extensions/my-todo/SPEC.md` | 同步工具白名单设计 |

### 3.4 项目元数据与文档

更新以下项目级文件：

- `README.md`：自定义扩展数量从 7 调整为 6；删除 `my-webtool` 条目；在首次设置中安装 `pi-web-access`。
- `REQUIREMENTS.md`：从本地扩展清单删除 `my-webtool`；将 `pi-web-access` 定义为必需的外部运行时包；新增对应验收标准；删除“本地 my-webtool 仅实现 Tavily”的排除项。
- `SPEC.md`：更新目录结构、运行时包边界、部署说明与外部 skill 归属。
- `turbo.json`：移除已无 workspace 消费的 `TAVILY_SEARCH_API` passthrough。
- `bun.lock`：通过 `bun install` 删除 `my-webtool` workspace 及其专属依赖记录。

根 `package.json` 的 `pi-extensions/*` workspace glob 无需修改。

## 4. 配置与凭证迁移

目标配置文件为 `~/.pi/web-search.json`。写入以下结构：

```json
{
  "provider": "auto",
  "workflow": "none",
  "allowBrowserCookies": false,
  "tavilyApiKey": "***redacted***"
}
```

迁移规则：

1. 从当前进程的 `TAVILY_SEARCH_API` 读取现有凭证。
2. 只检查是否为空，禁止输出凭证内容。
3. 将值写入 `tavilyApiKey`，因为 `pi-web-access` 不识别旧变量名。
4. 文件权限设为 `0600`。
5. 仓库不保存该文件或任何密钥。
6. 不删除来源不明的外部 `TAVILY_SEARCH_API` 定义；仓库迁移后不再消费该变量。
7. 如果迁移执行时配置文件已存在，则保留无关字段，仅覆盖上述四个已确认字段。

## 5. 数据流

### 5.1 搜索

```text
Agent
  → web_search
  → provider=auto
  → Codex/OpenAI、Exa、Brave、Parallel、Tavily 等可用链路
  → 原始搜索结果（workflow=none）
```

Tavily 凭证不强制 Tavily 成为首选 provider，只作为 auto fallback 链路中的可用凭证。

### 5.2 内容获取

```text
Agent
  → fetch_content
  → 普通网页 / GitHub / PDF / YouTube / 本地视频路由
  → 提取结果与 responseId
  → 必要时 get_search_content 读取保存的完整内容
```

本次迁移接受以下原生接口变化：

- 不再支持 `web_fetch({ raw: true })` 这一旧参数形式。
- 使用 `fetch_content` 的 URL 批量抓取和媒体/GitHub 路由能力。
- 大内容由包内存储并通过 `get_search_content` 继续读取，不沿用旧扩展的临时文件协议。

## 6. 切换与错误处理

迁移按以下顺序执行：

1. 更新现有需求与规格文档。
2. 安装 `npm:pi-web-access`。
3. 安全创建或合并 `~/.pi/web-search.json`。
4. 运行已安装包自带测试，确认所安装版本可用。
5. 完成仓库内 TDD 变更、删除本地 workspace，并通过全量构建测试。
6. 暂存旧部署副本作为短期回滚备份，再从 Pi 扩展目录移除旧部署。
7. 启动全新 Pi 进程验证工具注册和网络 smoke test。
8. 验证通过后删除临时回滚备份；当前已启动的 Pi 会话在下次重启后采用新工具集。

失败处理：

- 安装失败：不删除旧扩展。
- 源 Tavily 凭证为空：不写空 key，不进入切换步骤。
- 配置写入或权限设置失败：不删除旧扩展。
- 包自带测试失败：不删除旧扩展。
- 新进程 smoke test 失败：恢复旧部署副本，并报告实际失败证据。

## 7. 测试策略

### 7.1 TDD

`my-todo` 的 Plan 模式属于行为变更，严格执行红绿流程：

1. 先把测试期望从 `web_fetch` 改为 `fetch_content` 与 `get_search_content`。
2. 运行目标测试并确认因实现仍为旧白名单而失败。
3. 修改实现。
4. 重新运行目标测试并确认通过。

### 7.2 仓库验证

- `bun install`
- `bunx turbo run build test`
- 对本次触及的文件运行 Biome 检查。
- 检查 `git diff`，确保不覆盖迁移前已存在的无关未提交修改。
- 检查运行时代码和活动文档中不存在陈旧的 `web_fetch` / `my-webtool` 引用；历史设计文档中的迁移说明可保留。

### 7.3 运行时验证

- `pi list` 包含 `npm:pi-web-access`。
- `~/.pi/agent/extensions/my-webtool/` 不存在。
- `~/.pi/web-search.json` 权限为 `0600`，并且只检查非敏感字段和值存在性。
- 已安装包自带测试全部通过。
- 全新 Pi 进程只注册一个 `web_search`，并同时注册 `fetch_content` 与 `get_search_content`。
- 实际调用 `web_search` 返回结果。
- 实际调用 `fetch_content` 能抓取一个公开网页。

## 8. 验收标准

1. 仓库和部署目录均不再包含 `my-webtool`。
2. Pi 用户级包列表包含未固定版本的 `npm:pi-web-access`。
3. researcher、搜索技能和 Plan 模式均使用包原生工具名。
4. `provider=auto`、`workflow=none`、`allowBrowserCookies=false` 生效。
5. 现有 Tavily 凭证已安全迁移且未出现在日志、Git diff 或提交中。
6. 项目需求、规格、README、lockfile 与实际 6 个自定义扩展一致。
7. 仓库全量构建与测试通过。
8. 新 Pi 进程的工具注册与两项网络 smoke test 通过。
9. 用户原有的无关工作区修改保持不变。

## 9. 不做什么

- 不提供 `web_fetch` alias。
- 不保留 `/webtool-usage`。
- 不在仓库中管理 Pi `packages` 数组。
- 不固定 `pi-web-access` 版本。
- 不安装视频帧提取依赖。
- 不启用 Gemini Web 浏览器 Cookie。
- 不修改本次迁移无关的已安装 Pi 包或现有未提交文件。

## 10. 参考资料

- [Pi Web Access package page](https://pi.dev/packages/pi-web-access)
- [Pi Web Access repository](https://github.com/nicobailon/pi-web-access)
- [Pi package documentation](https://pi.dev/packages)
