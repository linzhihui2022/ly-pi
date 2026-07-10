# my-hud Spec

> 状态：已确认，可作为开发基准；模型短名配置仍待实现
> 确认日期：2026-06-02
> 最近整理：2026-07-10
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计哲学

my-hud 是一个**三层信息架构**的 pi 扩展，每层有且只有一个职责：

| 层级 | 职责 | 更新频率 | 类比 |
|------|------|----------|------|
| **aboveEditor** | **静态身份卡** — 你是谁、在用啥、花了多少 | 低频（模型切换、分支变化、回合结束） | 机票登机牌 |
| **footer** | **上下文锚点** — 当前对话的参照物 | 每回合更新 | 聊天记录里的「你刚才说」 |
| **working** | **情绪反馈** — AI 处理中的状态表达 | 每回合开始 | 加载动画的文案 |

**核心原则**：

- 一层一责，不越界。aboveEditor 不显示工具调用进度，footer 不显示统计数字，working 不显示技术信息。
- 能隐藏就不显示。分支为空时隐藏分支，没有用户消息时 footer 留空。
- 信息密度服从终端宽度。超长项目名截断，整行超长则尾部截断。

---

## 2. 三层详细规格

### 2.1 aboveEditor — 静态身份卡

**定位**：打开 pi 的第一眼信息，回答「我在哪、用谁、花了多少」。

**字段（从左到右，固定顺序）**：

| 字段 | 图标 | 内容 | 颜色规则 | 截断规则 |
|------|------|------|----------|----------|
| Project | `` | 当前目录 basename | `mdCode` | >10 字符截断为前8+`..` |
| Model | `` | 模型短名或原始 ID；当前使用内置映射，配置化映射见待实现项 | `mdHeading` | 不截断（短名应控制长度） |
| Branch | `` | Git 分支名；若存在关联 GitHub PR，则在分支名后追加 `#42` 编号，并包装为 OSC 8 可点击超链接 | `customMessageLabel` | 为空或无 PR 时整字段隐藏；分支名为空时该字段完全消失 |
| Context | `//` | 上下文使用率百分比 | 动态（见下） | 无 |
| Input | `` | 累计 input tokens | `mdListBullet` | 按 `formatTokens` 格式化 |
| Output | `` | 累计 output tokens | `thinkingLow` | 按 `formatTokens` 格式化 |
| Cache Read | `` | 累计 cache-read tokens | `thinkingMedium` | 按 `formatTokens` 格式化 |
| Cost | `` | 累计成本（CNY） | `toolDiffRemoved` | 保留两位小数 |
| Cache Rate | `󰄬` | cache read / (cache read + input) | `accent` | 四舍五入为整数百分比 |

**Context 颜色阈值**：

```
小窗口 (≤500k tokens):
  ≤70%  → accent (mauve)
  71-90% → warning (yellow)
  >90%  → error (red)

大窗口 (>500k tokens):
  ≤20%  → accent (mauve)
  21-50% → warning (yellow)
  >50%  → error (red)
```

**Context 图标映射**：

- `accent` → `` (空电池)
- `warning` → `` / `` (半电池，小窗口/大窗口)
- `error` → `` (满电池)

**触发刷新的事件**：

- `session_start` — 初始化
- `model_select` — 模型切换
- `turn_start` — 新回合开始（token 统计更新）
- `turn_end` — 回合结束（token 统计和 Git/PR 缓存更新）
- `branch_change` — Git 分支变化（由 footerData 订阅）

---

### 2.2 footer — 上下文锚点

**定位**：告诉用户「AI 正在回应的是哪条消息」，避免长对话中忘记上下文。

**内容**：最后一条非空用户消息的纯文本摘要。

**渲染规则**：

- 前缀：``（终端图标）+ 一个空格
- 颜色：`dim`
- 截断：按终端宽度截断，超出部分不显示
- 空状态：如果没有用户消息，footer 返回空数组（不占用行）

**内容提取逻辑**：

1. 从 session entries 末尾向前遍历
2. 找 `type === "message" && role === "user"` 的 entry
3. 内容类型支持：
   - `string` — 直接取 trim 后的文本
   - `Array` — 拼接所有 `text` 字段，非 text 部分替换为 `[MEDIA]`
   - `null` / `undefined` / 空数组 — 跳过
4. 跳过纯空白消息

**触发刷新的事件**：

- `turn_start` — 用户发新消息后更新

---

### 2.3 working — 情绪反馈

**定位**：在 AI 处理请求时，给用户一个"有人在干活"的感知，而非冰冷的系统状态。

**内容**：从预定义列表中随机选择一条中文趣味消息。

**渲染规则**：

- 通过 `ctx.ui.setWorkingMessage()` 设置
- 优先使用主题色：`theme.fg("accent", message)`
- 主题不可用时回退纯文本

**消息列表特征**：

- 中文为主，带 Nerd Font 图标前缀
- 风格： casual、幽默、略带自嘲
- 不显示技术信息（如"推理中"、"调用工具"）

**触发时机**：

- `turn_start` — 用户提交消息后立刻设置

---

## 3. 模块职责划分

```
index.ts    — 唯一的事件注册点，三层协调器
            — 职责：决定「什么事件触发哪一层的刷新」
            — 注册 `/open-pr` 和 `/mem` 指令

bar.ts      — aboveEditor 的 widget 生命周期
            — 职责：注册/注销 widget、持有 ctx 和 branch、转发 render 请求
            — 持有 Git 状态和 PR 信息并异步刷新

render.ts   — aboveEditor 的「纯函数」渲染器
            — 职责：给定 theme + width + data，返回字符串
            — 禁止：直接访问 ctx、调用副作用

git.ts      — Git 状态探测
            — 职责：解析 staged、unstaged、untracked、stashed、conflicted、ahead、behind
            — 禁止：直接访问 UI 或 ctx

pr.ts       — GitHub PR 探测与打开
            — 职责：给定 cwd 和 token，异步返回当前分支关联 PR 的编号与 URL
            — 提供 `getPullRequestForCurrentBranch()` 和 `openUrl()`，供 `/open-pr` 使用
            — 禁止：直接访问 UI 或 ctx

format.ts   — 格式化与颜色决策的纯函数
            — 职责：token 格式化、context 颜色阈值、cache hit rate、模型名映射

session.ts  — session 数据聚合与查询
            — 职责：累计 token/cost、提取最后用户消息
            — 注意：cost 转换（USD→CNY）在此处完成

memory.ts   — macOS 内存压力探测
            — 职责：读取 `vm_stat` 和 `sysctl -n hw.memsize` 并返回百分比

vitest-process.ts — 残留 Vitest 进程探测
            — 职责：解析 `ps -axo pid,command,rss` 输出

memory-widget.ts — aboveEditor 内存提示渲染
            — 职责：在内存压力过高时生成提示行

icons.ts    — 图标常量表
            — 职责：只读映射，无逻辑

working.ts  — 消息列表与随机选择
            — 职责：纯数据 + 纯随机函数

types.ts    — 跨模块共享类型
```

**依赖方向**（必须单向）：

```
index.ts → bar.ts → render.ts → format.ts → icons.ts
         → git.ts
         → pr.ts
         → session.ts ────────────────┘
         → working.ts
         → memory.ts → memory-widget.ts
         → vitest-process.ts ────────┘
```

- `render.ts` 不依赖 `bar.ts`
- `format.ts` 不依赖 `session.ts`
- `index.ts` 是唯一感知「事件」的模块

---

## 4. 数据流

### 4.1 aboveEditor 刷新流

```
事件触发 (session_start / model_select / turn_start / turn_end / branch_change)
  │
  ▼
bar.requestRender() ──→ TUI 请求重绘
  │
  ▼
widget render callback
  │
  ▼
bar.renderWidget(theme, width)
  ├── ctx.sessionManager.getEntries() ──→ session.ts: aggregateSessionUsage()
  ├── ctx.getContextUsage()
  ├── ctx.model?.id
  ├── basename(ctx.cwd)
  ├── branch (之前由 footerData 注入)
  ├── gitStatus (由 git.ts 异步探测并缓存)
  └── pullRequest (由 pr.ts 异步探测并缓存)
  │
  ▼
render.ts: buildStatusLine(theme, width, data)
  ├── format.ts: formatTokens()
  ├── format.ts: shortModelName()
  ├── format.ts: contextColored()
  ├── format.ts: formatCacheRate()
  ├── render.ts: formatGitStatus()
  ├── pr.ts 提供的 pullRequest.url / number
  └── icons.ts: icon()
  │
  ▼
truncateToWidth(line, width) ──→ 返回 string[]
```

### 4.2 footer 刷新流

```
事件触发 (session_start / turn_start)
  │
  ▼
ctx.ui.setFooter(factory) 的 render callback
  │
  ▼
session.ts: getLastUserMessage(entries)
  │
  ▼
truncateToWidth(theme.fg("dim", icon + message), width)
```

### 4.3 working 设置流

```
turn_start 事件
  │
  ▼
working.ts: pickRandomMessage()
  │
  ▼
ctx.ui.setWorkingMessage(theme.fg("accent", message))
```

### 4.4 内存提示流

```
agent_start / agent_end 事件
  │
  ▼
memory.ts: checkMemoryPressure()
  │
  ├── ok=true  ──→ 移除 my-hud-memory-warning widget
  │
  └── ok=false ──→ vitest-process.ts: findVitestProcesses()
                   │
                   ▼
                 memory-widget.ts: buildMemoryWarningLines()
                   │
                   ▼
                 ctx.ui.setWidget(..., placement: "aboveEditor")
```

### 4.5 Slash 命令流

- `/open-pr`：调用 `pr.ts:getPullRequestForCurrentBranch()`；有 PR 时调用 `openUrl()`，打开失败则通知 PR URL。
- `/mem`：调用 `memory.ts:checkMemoryPressure()`；根据 `ok` 返回 info 或 warning 通知。

---

## 5. 扩展点（未来需求着陆区）

为避免新需求破坏现有层次，预定义以下扩展位置：

| 需求方向 | 建议层级 | 备注 |
|----------|----------|------|
| 显示当前 step / 工具调用状态 | **新增中间层**（belowEditor） | 不要塞进 aboveEditor |
| 显示当前时间 / 计时器 | aboveEditor 新增字段 | 放在 Cost 右侧 |
| 多货币切换（USD/CNY） | `format.ts` 或配置项 | 影响 render.ts 的调用签名 |
| 用户自定义 working 消息 | `working.ts` 读取外部配置 | 保持随机选择机制 |
| 显示最后 AI 回复摘要 | **不要** — 与 footer 职责冲突 | 如需此功能，新增「AI 摘要层」 |

---

## 6. 待决策项

以下问题不在当前实现中，标注为待决策项，不阻塞现有功能：

1. **模型短名配置实现方式**：`REQUIREMENTS.md` 已要求 `my-hud.json` 支持 `modelShortNames`，仍需确定读取时机、默认值合并和 `/reload` 行为。
2. **footer 交互**：是否支持点击 footer 复制消息内容？
3. **aboveEditor 字段可选**：是否允许用户通过配置隐藏某些字段（如 Cost）？
4. **working 消息持久化**：同一回合内是否保持同一条 working 消息（当前每 turn_start 都重新随机）？

---

## 7. 测试策略

- **纯函数**（`format.ts`, `render.ts`, `session.ts`, `working.ts`, `memory-widget.ts`）：单元测试，覆盖率 100%
- **Bar 类**：mock TUI 和 ctx，测试 widget 注册/注销/render 行为
- **集成入口**：mock `ExtensionAPI`，测试事件注册、命令 handler 和 widget 更新行为
- **系统探测**：mock shell 输出，测试 `git.ts`、`pr.ts`、`memory.ts`、`vitest-process.ts`
- **不测试**：真实 TUI 渲染、真实 GitHub API、真实浏览器打开、真实 session 数据

---

## 8. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-02 | 整理现有代码，重新定义三层职责，生成本 spec |
| 2026-07-08 | 新增 aboveEditor 分支后显示 GitHub PR 编号的规格与数据流说明 |
| 2026-07-08 | 新增 `/open-pr` 指令规格 |
| 2026-07-10 | 同步 Git 状态、cache hit rate、内存提示、`/mem` 和模型短名配置待实现项 |
