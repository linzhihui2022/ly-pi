# my-hud Git Status 设计文档

> 日期：2026-06-03
> 状态：已确认，待实现

---

## 1. 背景与目标

用户希望 `my-hud` 的 aboveEditor bar 能够展示与 `starship.toml` 中 `git_status` 模块一致的信息。当前 bar 仅展示 Git 分支名，缺少与远程分支的相对位置（ahead/behind/diverged）、暂存区数量、储藏数量、冲突数量等状态。

---

## 2. 需求确认

### 2.1 展示内容（与 starship 对齐）

根据 `starship.toml` 中 `git_status` 的配置，以下状态被显式配置为非空值，需要展示：

| 状态类型 | starship 格式 | 颜色（starship 配置） | 说明 |
|----------|--------------|----------------------|------|
| `ahead` | `[⇡${count}](green)` | green | 本地领先远程的 commit 数 |
| `behind` | `[⇣${count}](peach)` | peach | 本地落后远程的 commit 数 |
| `diverged` | `[⇕⇡${ahead_count}⇣${behind_count}](yellow)` | yellow | 本地和远程分叉 |
| `staged` | `[++${count}](green)\|` | green | 已暂存文件数 |
| `stashed` | `[*${count}](peach)\|` | peach | stash 数量 |
| `conflicted` | `[!!${count}](red)\|` | red | 冲突文件数 |

以下状态在 starship 中设为空字符串，**不展示**：
- `untracked`, `modified`, `renamed`, `deleted`, `typechanged`

### 2.2 排除范围

| 功能 | 排除原因 |
|------|----------|
| 工作区变更（modified/untracked/deleted） | starship 配置中已设为空，不展示 |
| 终端提示符的 `git_branch` 样式 | bar 已有独立的 branch 字段和颜色规则 |

---

## 3. 显示格式

接在 Branch 字段之后，用单个空格分隔：

```
干净（无远程跟踪）:
   main

有远程，干净:
   main

领先远程 2 commit:
   main ⇡2

3 staged, 1 stash, 仅领先远程1 commit:
   main ++3|*1|⇡1

分叉（ahead=3, behind=2）:
   main ++3|*1|⇕⇡3⇣2
```

不在 git 仓库时，整段（branch + status）隐藏，与现有行为一致。

---

## 4. 架构设计

### 4.1 新增模块

**`git.ts`** — Git 状态获取与解析
- 职责：给定 `cwd`，通过 `git status --porcelain=v2 --branch` 和 `git stash list` 获取状态
- 输出结构化的 `GitStatus` 对象
- 纯函数，无状态，可单元测试

### 4.2 修改模块

**`bar.ts`** — 增加 git 状态缓存与异步刷新
- 增加 `gitStatus: GitStatus | null` 字段
- 增加 `gitStatusCacheTime: number` 用于 TTL 判断
- `renderWidget` 中：缓存有效时直接用，缓存过期时返回旧值 + 异步刷新
- `invalidateGitStatus()` 方法供外部调用

**`render.ts`** — `buildStatusLine` 追加状态渲染
- 接收 `gitStatus` 参数
- 按 starship 配置的格式和颜色拼接状态字符串
- 放在 Branch 字段之后

**`index.ts`** — 事件驱动刷新
- `footerData.onBranchChange` → 调用 `bar.invalidateGitStatus()` + `requestRender()`
- `turn_start` / `turn_end` → 同上（回合结束时用户最可能关注 git 状态）

**`types.ts`** — 类型扩展
- `StatusLineData` 增加 `gitStatus?: GitStatus | null`

### 4.3 缓存策略（性能保障）

```
TTL: 5000ms

renderWidget 调用时:
  1. 检查 cacheTime，若在 5s 内 → 直接返回旧值
  2. 若已过期:
     a. 立即返回旧值（保证 render 不阻塞）
     b. 启动异步 git 命令
     c. 命令完成后更新 cache → 触发 requestRender()
```

最坏情况：每 5 秒最多执行 1 次 `git status` + 1 次 `git stash list`。大型 repo 中也不会阻塞 TUI。

### 4.4 降级配置

`my-hud.json` 支持关闭 git 状态：
```json
{ "gitStatus": false }
```
默认开启（`true`）。

---

## 5. 数据流

```
事件触发 (branch_change / turn_start / turn_end)
  │
  ▼
bar.invalidateGitStatus() ──→ 清除 cacheTime
  │
  ▼
bar.requestRender() ──→ TUI 请求重绘
  │
  ▼
widget render callback
  │
  ▼
bar.renderWidget(theme, width)
  ├── 检查 gitStatusCacheTime
  │   ├── 有效 → 使用 cached gitStatus
  │   └── 过期 → 返回旧值，异步调用 git.ts:getGitStatus(cwd)
  │              → 完成后更新 cache + requestRender()
  ├── ctx.sessionManager.getEntries()
  ├── ctx.getContextUsage()
  ├── ctx.model?.id
  ├── basename(ctx.cwd)
  ├── branch
  └── gitStatus
  │
  ▼
render.ts: buildStatusLine(theme, width, data)
  ├── format branch + gitStatus 字符串
  │
  ▼
truncateToWidth(line, width) ──→ 返回 string[]
```

---

## 6. 测试策略

- **`git.ts`**：mock `child_process.exec`，测试各种 git status 输出格式的解析正确性
- **`render.ts`**：测试 `buildStatusLine` 对不同 `GitStatus` 组合的渲染
- **`bar.ts`**：mock TUI 和 git 模块，测试缓存命中/过期、异步刷新行为
- **不测试**：真实 git 命令执行、真实文件系统监听

---

## 7. 实现顺序

1. 新增 `git.ts` + 单元测试
2. 修改 `types.ts`（`GitStatus` 类型、`StatusLineData` 扩展）
3. 修改 `render.ts` + 单元测试
4. 修改 `bar.ts`（缓存逻辑）+ 单元测试
5. 修改 `index.ts`（事件注册）
6. 集成测试 / 端到端验证

---

## 8. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-03 | 初始设计文档 |
