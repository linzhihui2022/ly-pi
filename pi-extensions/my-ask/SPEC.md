# my-ask Spec

> 状态：已确认，可作为开发基准
> 确认日期：2026-06-12
> 最近整理：2026-07-10
> 需求文档：[`REQUIREMENTS.md`](./REQUIREMENTS.md)

## 1. 设计目标

- **Drop-in 替代**：保持原工具名 `ask_user_question` 与 schema，卸载原扩展后无需修改提示词。
- **最小依赖**：仅使用 Pi SDK（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`）与 `typebox`。
- **TDD**：先写测试；纯函数与问卷状态机目标 100% 覆盖率。
- **可维护**：模块边界清晰、依赖单向；UI 从简单的上下列表布局开始。

## 2. 模块结构

```
pi-extensions/my-ask/
├── index.ts              # 扩展入口：注册 ask_user_question
├── types.ts              # typebox schema + 结果类型
├── validate.ts           # 参数校验（纯函数）
├── format.ts             # 将用户答案组装为面向 LLM 的文本
├── questionnaire.ts      # 自定义 TUI 组件（核心交互）
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── SPEC.md               # 本文档
├── REQUIREMENTS.md       # 需求清单
└── scripts/deploy.ts     # 部署到 ~/.pi/agent/extensions/my-ask
```

依赖方向：

```
index.ts → questionnaire.ts → types.ts
         → validate.ts ──────┘
         → format.ts ────────┘
```

`questionnaire.ts` 通过 `ctx.ui.custom` 渲染，不依赖 `index.ts` 的事件注册。

## 3. 工具定义

### 3.1 工具名

`ask_user_question`

### 3.2 Schema

```ts
const OptionSchema = Type.Object({
  label: Type.String({ maxLength: 60 }),
  description: Type.String(),
  preview: Type.Optional(Type.String()),
});

const QuestionSchema = Type.Object({
  question: Type.String(),
  header: Type.String({ maxLength: 16 }),
  options: Type.Array(OptionSchema, { minItems: 2, maxItems: 4 }),
  multiSelect: Type.Optional(Type.Boolean({ default: false })),
});

const QuestionParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }),
});
```

### 3.3 限制

| 项 | 限制 |
|---|---|
| 单次最大问题数 | 4 |
| 每问题最小选项数 | 2 |
| 每问题最大选项数 | 4 |
| header 最大长度 | 16 |
| label 最大长度 | 60 |
| Preview | 仅单选；抑制 "Type something." 但保留 "Chat about this" |

### 3.4 保留标签

以下选项标签会被校验拒绝：

- `Other`
- `Type something.`
- `Chat about this`
- `Next`

### 3.5 提示词元数据

工具注册 `promptSnippet` 与 `promptGuidelines`，让 LLM 在可用工具列表中识别并了解何时/如何使用该工具，与原扩展保持一致。

## 4. UI 设计

### 4.1 上下列表布局

```
──────────────────────────────────
 Which layout should we use?  [Layout]
──────────────────────────────────

> 1. Vertical list
     A simple top-question, bottom-options layout.
  2. Side-by-side
     Left options, right preview pane.
  3. Chat about this

 ↑↓ navigate • Enter select • Esc cancel
──────────────────────────────────
```

### 4.2 多问题导航

多问题时顶部显示 tab bar：

```
← □ Q1  ■ Q2  □ Q3  ✓ Submit →
```

- 已答问题显示 `■`，未答显示 `□`。
- `Tab` / `←` / `→` 切换 tab。
- Submit tab 上按 Enter 在所有问题已答时提交。

### 4.3 Preview 展开

单选问题中若任意选项包含 `preview`，聚焦选项的 markdown preview 渲染在列表下方：

```
> 1. Option A
     Description for A.

 Preview:
 ┌──────────────────────────────────────┐
 │ # Sample config                      │
 │ value = 42                           │
 │                                      │
 └──────────────────────────────────────┘
```

- Preview 抑制 "Type something." 行。
- 长行在框内自动换行。
- Preview 框高度限制约 6 行；内容更短时不添加额外空白。
- 超出高度时显示 `(more...)` 提示。
- 边框使用强调色保持视觉一致。

### 4.4 自定义输入

无 preview 的问题列表末尾自动添加 "Type something." 行。选中后打开行内编辑器：

```
 Your answer:
 [inline editor]
 Enter to submit • Esc to go back
```

按 Enter 应用自定义值并返回选项列表。输入值作为新行 `<value> (custom)` 加入选项列表；不会自动提交。用户随后可将焦点移到该行并按 Enter 选择/提交，也可继续添加更多自定义值，或用 Delete/Backspace 删除它。

单选列表变为：

```
> 1. Red
  2. Blue
  3. Purple (custom)
  4. Type something.
  5. Chat about this
```

多选中，自定义值作为额外的已勾选行 `[x] <value> (custom)` 出现在 "Type something." 行上方；Space 切换选中状态，Enter 提交当前选择。

### 4.5 多选

多选问题使用复选框，也支持 "Type something." 行：

```
> [x] Option A
  [ ] Option B
  [x] Option C
  [ ] Type something.

 Space toggle • Enter submit
```

切换复选框将选项加入或移出当前选择。"Type something." 行打开行内编辑器；输入值作为已勾选行 `[x] <value> (custom)` 加入，焦点返回选项列表以便用户审查或修改选择。Space 可取消自定义行选中，Delete/Backspace 可删除自定义行。

按 `a` 选择所有当前行（预设选项 + 已有自定义行）。如果所有可选行都已选中，则再次按 `a` 清空所有选择，实现 "全选 / 全不选" 快速切换。

## 5. 导航

| 按键 | 行为 |
|---|---|
| `↑` / `↓` | 移动选项焦点 |
| `Tab` / `→` / `←` | 切换问题 tab（仅多问题） |
| `Enter` | 选择聚焦选项；应用自定义输入并加入列表；在 Submit tab 提交 |
| `Space` | 多选中切换复选框（含自定义行） |
| `a` | 多选中全选当前行；再次按清空所有 |
| `Delete` / `Backspace` | 删除聚焦的自定义行 |
| `Esc` | 取消问卷，或退出自定义输入模式 |

## 6. 错误与返回值

### 6.1 返回结构

```ts
interface QuestionAnswer {
  questionIndex: number;
  question: string;
  kind: "option" | "custom" | "chat" | "multi";
  answer: string | null;
  selected?: string[];
  preview?: string;
}

interface QuestionnaireResult {
  answers: QuestionAnswer[];
  cancelled: boolean;
  error?: QuestionnaireError;
}
```

### 6.2 错误码

- `no_ui` — `ctx.hasUI` 为 false（非交互/RPC UI 上下文）
- `no_questions` — 未提供问题
- `too_many_questions` — 问题数超过 4
- `empty_options` — 某问题选项少于 2
- `duplicate_question` — 问题文本重复
- `duplicate_option_label` — 同一问题内选项 label 重复
- `reserved_label` — 选项 label 为保留标签

### 6.3 工具结果文本

- 完成：`User has answered your questions: "Q"="A". ... You can now continue with the user's answers in mind.`
- 取消/无答案：`User declined to answer questions`

## 7. 测试策略

| 模块 | 测试风格 | 覆盖目标 |
|---|---|---|
| `validate.ts` | 纯函数单元测试 | 100% |
| `format.ts` | 纯函数单元测试 | 100% |
| `questionnaire.ts` | mock TUI/Editor 状态机测试 | 100% |
| `index.ts` | mock `ExtensionAPI` 集成测试 | 排除 |
| `types.ts` | 纯类型定义 | 排除 |

关键场景：

1. 单选 + 自定义输入
2. 多选完成
3. 带 preview 的单选
4. 用户取消
5. 非 UI 模式错误
6. 校验失败（问题数、选项数、重复、保留标签）
7. 多问题 tab 导航与提交

## 8. 部署

1. `bunx turbo run build` → `dist/index.js`
2. `bun run deploy` 复制 `dist/index.js` 到 `~/.pi/agent/extensions/my-ask/index.js`
3. 在 Pi 中运行 `/reload`
4. 用 `pi uninstall @juicesharp/rpiv-ask-user-question` 卸载原扩展，避免名称冲突

## 9. 排除功能

| 功能 | 排除原因 |
|---|---|
| i18n | 本地使用；英文 UI 足够 |
| 外部事件通知 | 不需要 |
| 可配置 guidance 片段 | 不需要 |
| 并排 preview 窗格 | 从简单的上下 preview 开始 |
| 每个选项的 notes | 为简化而省略 |

## 10. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-06-12 | 确认替代方案、schema、UI 布局与测试策略 |
| 2026-06-12 | 修订自定义输入流程：自定义值变为可选列表行并支持删除 |
| 2026-07-10 | 统一文档格式与状态头，将正文翻译为中文 |
