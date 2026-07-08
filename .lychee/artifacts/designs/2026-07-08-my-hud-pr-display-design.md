# my-hud 显示当前分支 GitHub PR 设计

> 状态：已确认，待实现  
> 日期：2026-07-08

## 1. 目标

在 `my-hud` 扩展的 `aboveEditor` 状态行中，于分支名后显示当前分支关联的 GitHub Pull Request 编号，并使其成为可点击的超链接，点击后在浏览器中打开 PR 页面。

## 2. 显示效果

- 分支字段后追加 PR 编号：`main#42`
- 在支持 OSC 8 超链接的终端（Ghostty、Kitty、WezTerm、iTerm2、VSCode 等）中，`#42` 是可点击区域，点击打开 `https://github.com/owner/repo/pull/42`
- 在不支持 OSC 8 的终端中，仍显示为纯文本 `#42`，只是不可点击
- 当前分支没有关联 PR 时，不显示任何 PR 信息，保持 `main`

## 3. 非目标

- 不在 footer 或 working 层显示 PR 信息
- 不显示 PR 标题、作者、状态图标等额外信息
- 不支持 Linear diff、GitLab MR 等其他代码审查平台
- 不处理 fork 仓库等复杂场景（仅支持当前 remote 对应的默认仓库）

## 4. 模块设计

### 4.1 新增 `pr.ts`

职责单一：探测当前分支关联的 GitHub PR 编号与 URL。

```typescript
export interface PullRequestInfo {
  number: number;
  url: string; // html_url，用于 OSC 8 超链接
}

export async function getPullRequestNumber(
  cwd: string,
  token?: string,
): Promise<PullRequestInfo | null>;
```

探测顺序：

1. **优先 `gh` CLI**：执行 `gh pr view --json number,url --state all`
   - 解析 JSON 返回 `number` 和 `url`
   - 失败或无 PR 时进入下一步
2. **降级 GitHub API**：
   - 从 `git remote -v` 解析 `owner/repo`
   - 从 `GITHUB_TOKEN` 环境变量取 token
   - 调用 `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=all`
   - 取返回数组的第一条 PR，提取 `number` 和 `html_url`
3. 都失败返回 `null`

### 4.2 修改 `types.ts`

新增类型：

```typescript
export interface PullRequestInfo {
  number: number;
  url: string;
}
```

`StatusLineData` 增加可选字段：

```typescript
export interface StatusLineData {
  // ...existing fields
  pullRequest?: PullRequestInfo | null;
}
```

### 4.3 修改 `bar.ts`

与 `gitStatus` 保持一致的缓存策略：

- 新增 `pullRequest: PullRequestInfo | null`
- 新增 `pullRequestCacheTime: number`
- 新增 `pullRequestRefreshPending: boolean`
- 新增 `ensurePullRequest()`：TTL 5 秒异步刷新
- 分支变化或 `turn_end` 时调用 `invalidatePullRequest()`
- `renderWidget()` 将 `pullRequest` 注入 `StatusLineData`

### 4.4 修改 `render.ts`

`buildStatusLine()` 中处理分支字段时：

```typescript
if (branch) {
  const branchPrefix = theme.fg("customMessageLabel", `${icon("branch")}${branch}`);
  let branchText = branchPrefix;

  if (pullRequest?.number) {
    const prLabel = `#${pullRequest.number}`;
    const coloredPr = theme.fg("customMessageLabel", prLabel);
    const clickablePr = getCapabilities().hyperlinks
      ? hyperlink(coloredPr, pullRequest.url)
      : coloredPr;
    branchText += clickablePr;
  }

  parts.push(branchText);
  // ... git status
}
```

注意：先对分支名和 PR 编号分别染色，再包装超链接，避免 OSC 8 序列与颜色序列冲突。

### 4.5 配置

`my-hud.json` 配置系统尚未实现，因此 API fallback 仅使用 `GITHUB_TOKEN` 环境变量。不配置则优先走 `gh` CLI；若 gh 不可用且无 token，则降级为不显示 PR 信息。

未来 `my-hud.json` 实现后，可扩展为从配置读取 `githubToken`。

## 5. 数据流

```
事件触发（session_start / turn_end / branch_change）
  │
  ▼
bar.ensurePullRequest() 异步启动
  │
  ▼
pr.ts: getPullRequestNumber(cwd)
  ├── gh pr view --json number,url
  └── 失败后走 GitHub API
  │
  ▼
获取成功 → requestRender() → renderWidget()
  │
  ▼
render.ts: buildStatusLine()
  └── 若 hyperlinks 支持：hyperlink(#number, url)
```

## 6. 错误处理

- `gh` 未安装或命令失败：静默降级到 API
- API 无 token 或 token 无效：返回 `null`，不显示 PR 信息
- 网络超时（3 秒）：返回 `null`，不显示 PR 信息
- 分支无关联 PR：返回 `null`，不显示 PR 信息
- 任何错误都不阻塞其他字段渲染

## 7. 测试策略

新增与修改的测试：

- `pr.test.ts`：
  - `parseGhPrOutput` 正确解析 JSON 中的 number 和 url
  - `parseRemoteUrl` 正确从 `git@github.com:owner/repo.git` 和 `https://github.com/owner/repo.git` 解析 owner/repo
  - GitHub API 查询成功返回 PR
  - GitHub API 无 token 返回 null
  - 无关联 PR 返回 null
  - 网络错误返回 null
  
- `render.test.ts`（更新）：
  - 无 PR 时分支字段保持原样
  - 有 PR 且支持超链接时，输出包含 OSC 8 序列
  - 不支持超链接时输出纯文本 `#number`
  
- `bar.test.ts`（更新）：
  - PR 信息缓存 TTL 生效
  - 分支变化后清空 PR 缓存
  - 异步刷新后触发 `requestRender`

覆盖率要求：branches/functions/lines/statements 全部 100%。

## 8. 依赖

- `@earendil-works/pi-tui` 已提供 `hyperlink` 和 `getCapabilities`
- 新增 `node:child_process` 调用（与 `git.ts` 一致）
- 新增 `fetch` 调用用于 GitHub API（Bun 内置）

## 9. 变更清单

| 文件 | 变更 |
|------|------|
| `pr.ts` | 新增 PR 探测模块 |
| `pr.test.ts` | 新增测试 |
| `types.ts` | 新增 `PullRequestInfo` 类型，更新 `StatusLineData` |
| `bar.ts` | 增加 PR 信息缓存与刷新 |
| `bar.test.ts` | 增加 PR 缓存相关测试 |
| `render.ts` | 分支字段后渲染 PR 编号与超链接 |
| `render.test.ts` | 更新测试断言 |
| `index.ts` | 在 `turn_end` 和分支变化时清空 PR 缓存 |
| `REQUIREMENTS.md` | 更新需求确认清单 |
| `SPEC.md` | 更新 aboveEditor 字段说明 |
| `my-hud.json` | 不改动（配置系统尚未实现） |

## 10. 待确认项

无。
