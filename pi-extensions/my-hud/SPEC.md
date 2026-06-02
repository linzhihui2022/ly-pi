# my-hud Spec

> 状态：需求澄清草案  
> 目标：重新定义 aboveEditor / footer / working 三层职责，消除功能归属混乱。

---

## 1. 设计哲学

my-hud 是一个**三层信息架构**的 pi 扩展，每层有且只有一个职责：

| 层级 | 职责 | 更新频率 | 类比 |
|------|------|----------|------|
| **aboveEditor** | **静态身份卡** — 你是谁、在用啥、花了多少 | 低频（模型切换、分支变化、回合结束） | 机票登机牌 |
| **footer** | **上下文锚点** — 当前对话的参照物 | 每回合更新 | 聊天记录里的「你刚才说」 |
| **working** | **情绪反馈** — AI 处理中的状态表达 | 每回合开始 | 加载动画的文案 |

**核心原则**：

- 一层一责，不越界。aboveEditor 不显示动态进度，footer 不显示统计数字，working 不显示技术信息。
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
| Model | `` | 模型短名或原始 ID | `mdHeading` | 不截断（短名已控制长度） |
| Branch | `` | Git 分支名 | `customMessageLabel` | 不截断；为空时整字段隐藏 |
| Context | `//` | 上下文使用率百分比 | 动态（见下） | 无 |
| Input | `` | 累计 input tokens | `mdListBullet` | 按 `formatTokens` 格式化 |
| Output | `` | 累计 output tokens | `thinkingLow` | 按 `formatTokens` 格式化 |
| Cache Read | `` | 累计 cache-read tokens | `thinkingMedium` | 按 `formatTokens` 格式化 |
| Cost | `` | 累计成本（CNY） | `toolDiffRemoved` | 保留两位小数 |

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

bar.ts      — aboveEditor 的 widget 生命周期
            — 职责：注册/注销 widget、持有 ctx 和 branch、转发 render 请求

render.ts   — aboveEditor 的「纯函数」渲染器
            — 职责：给定 theme + width + data，返回字符串
            — 禁止：直接访问 ctx、调用副作用

format.ts   — 格式化与颜色决策的纯函数
            — 职责：token 格式化、context 颜色阈值、模型名映射

session.ts  — session 数据聚合与查询
            — 职责：累计 token/cost、提取最后用户消息
            — 注意：cost 转换（USD→CNY）在此处完成

icons.ts    — 图标常量表
            — 职责：只读映射，无逻辑

working.ts  — 消息列表与随机选择
            — 职责：纯数据 + 纯随机函数

types.ts    — 跨模块共享类型
```

**依赖方向**（必须单向）：

```
index.ts → bar.ts → render.ts → format.ts → icons.ts
         → session.ts ────────────────┘
         → working.ts
```

- `render.ts` 不依赖 `bar.ts`
- `format.ts` 不依赖 `session.ts`
- `index.ts` 是唯一感知「事件」的模块

---

## 4. 数据流

### 4.1 aboveEditor 刷新流

```
事件触发 (session_start / model_select / turn_start / branch_change)
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
  └── branch (之前由 footerData 注入)
  │
  ▼
render.ts: buildStatusLine(theme, width, data)
  ├── format.ts: formatTokens()
  ├── format.ts: shortModelName()
  ├── format.ts: contextColored()
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

---

## 5. 扩展点（未来需求着陆区）

为避免新需求破坏现有层次，预定义以下扩展位置：

| 需求方向 | 建议层级 | 备注 |
|----------|----------|------|
| 显示当前 step / 工具调用状态 | **新增中间层**（belowEditor） | 不要塞进 aboveEditor |
| 显示当前时间 / 计时器 | aboveEditor 新增字段 | 放在 Cost 右侧 |
| 多货币切换（USD/CNY） | `format.ts` 或配置项 | 影响 render.ts 的调用签名 |
| 模型名短名可配置 | `format.ts` 或配置文件 | 当前硬编码，可改为读取配置 |
| 用户自定义 working 消息 | `working.ts` 读取外部配置 | 保持随机选择机制 |
| 显示最后 AI 回复摘要 | **不要** — 与 footer 职责冲突 | 如需此功能，新增「AI 摘要层」 |
| 显示最近文件变更 | aboveEditor 新增字段 | 放在 Branch 右侧 |

---

## 6. 待决策项

以下问题不在当前实现中，spec 中标注为 TBD，不阻塞现有功能：

1. **配置系统**：是否支持 JSON 配置（如模型名映射、货币汇率、自定义 working 消息）？
2. **footer 交互**：是否支持点击 footer 复制消息内容？
3. **aboveEditor 字段可选**：是否允许用户通过配置隐藏某些字段（如 Cost）？
4. **working 消息持久化**：同一回合内是否保持同一条 working 消息（当前每 turn_start 都重新随机）？

---

## 7. 测试策略

- **纯函数**（`format.ts`, `render.ts`, `session.ts`, `working.ts`）：单元测试，覆盖率 100%
- **Bar 类**：mock TUI 和 ctx，测试 widget 注册/注销/render 行为
- **index.ts**：mock `ExtensionAPI`，测试事件注册和 handler 行为
- **不测试**：真实 TUI 渲染、真实 Git 分支获取、真实 session 数据

---

## 8. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-02 | 整理现有代码，重新定义三层职责，生成本 spec |
