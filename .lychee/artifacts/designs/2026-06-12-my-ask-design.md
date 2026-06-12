# my-ask Spec

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-12  
> 目标：打造本地 my-ask 扩展，替代 `@juicesharp/rpiv-ask-user-question`。

---

## 1. 设计哲学

- **平替优先**：沿用原工具名 `ask_user_question` 与 schema，卸载原扩展后 prompt 无需改动。
- **精简依赖**：不引入 `@juicesharp/rpiv-*` 生态，只依赖 Pi SDK（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`）和 `typebox`。
- **TDD 驱动**：先写测试，再写实现；纯函数与状态机覆盖率 100%。
- **可维护**：模块职责清晰，依赖单向；UI 先从简单可靠的上下列表式开始。

---

## 2. 模块与文件结构

新增目录 `pi-extensions/my-ask/`：

```
pi-extensions/my-ask/
├── index.ts              # 扩展入口：注册 ask_user_question 工具
├── types.ts              # typebox schema + 结果类型
├── validate.ts           # 参数校验（纯函数）
├── format.ts             # 把用户答案组装成给 LLM 的文本
├── questionnaire.ts      # 自定义 TUI 组件（核心交互）
├── package.json          # 依赖 pi-coding-agent / pi-tui / typebox
├── vitest.config.ts      # 覆盖率排除 types.ts / index.ts
├── SPEC.md               # 本设计文档
├── REQUIREMENTS.md       # 需求确认清单
└── scripts/deploy.ts     # 部署到 ~/.pi/agent/extensions/my-ask
```

**依赖方向**：

```
index.ts → questionnaire.ts → types.ts
         → validate.ts ──────┘
         → format.ts ────────┘
```

`questionnaire.ts` 通过 `ctx.ui.custom` 渲染，不直接依赖 `index.ts` 的事件注册逻辑。

---

## 3. 工具定义

### 3.1 工具名

`ask_user_question`

### 3.2 Schema（沿用原扩展）

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
| 每调用最大问题数 | 4 |
| 每问题最小选项数 | 2 |
| 每问题最大选项数 | 4 |
| header 最大长度 | 16 |
| label 最大长度 | 60 |
| preview | 仅单选有效；有 preview 时隐藏「Type something.」行，保留「Chat about this」逃生口 |

### 3.4 保留标签

以下 label 不允许出现在用户选项中（与原扩展一致）：

- `Other`
- `Type something.`
- `Chat about this`
- `Next`

---

## 4. UI 设计

### 4.1 布局：上下列表式

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

### 4.2 多题导航

多题时顶部显示 tab 栏：

```
← □ Q1  ■ Q2  □ Q3  ✓ Submit →
```

- 已答题显示 `■`，未答显示 `□`
- Tab / ←→ 切换 tab
- 选中 Submit 且全部已答时，Enter 提交

### 4.3 preview 展开

单选问题中存在 `preview` 时，选中对应选项在列表下方展开 markdown 预览框：

```
> 1. Option A
     Description for A.

 Preview:
 ┌────────────────────────────┐
 │ # Sample config            │
 │ value = 42                 │
 └────────────────────────────┘
```

有 preview 的问题不显示「Type something.」，只显示选项 + 「Chat about this」。

### 4.4 自定义输入

单选无 preview 的问题，选项列表末尾自动追加「Type something.」。选中后进入 inline editor：

```
 Your answer:
 [inline editor]
 Enter to submit • Esc to go back
```

### 4.5 多选

多选问题的每个选项前显示 `☐` / `☑`：

```
> ☐ Option A
  ☐ Option B
  ☑ Option C

 Space toggle • Enter submit
```

多选不显示「Type something.」。

---

## 5. 交互与导航

| 按键 | 行为 |
|---|---|
| ↑ / ↓ | 移动选项焦点 |
| Tab / → / ← | 多题时切换问题 tab |
| Enter | 选中当前选项；或在自定义输入模式下提交；或在 Submit tab 提交问卷 |
| Space | 多选时切换当前选项的选中状态 |
| Esc | 取消整个问卷；或在自定义输入模式下返回选项列表 |

---

## 6. 错误处理与返回值

### 6.1 返回结构

兼容原扩展：

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

- `no_ui` — 非交互模式
- `no_questions` — 未提供问题
- `too_many_questions` — 超过 4 题
- `empty_options` — 选项少于 2 个
- `duplicate_question` — 问题文本重复
- `duplicate_option_label` — 同一问题内选项 label 重复
- `reserved_label` — 选项 label 命中保留词

### 6.3 工具结果文本

- 用户完成：`User has answered your questions: "Q"="A". ... You can now continue with the user's answers in mind.`
- 用户取消/无答案：`User declined to answer questions`

---

## 7. 测试策略

| 模块 | 测试方式 | 覆盖率要求 |
|---|---|---|
| `validate.ts` | 纯函数单元测试 | 100% |
| `format.ts` | 纯函数单元测试 | 100% |
| `questionnaire.ts` | mock TUI/Editor，测试状态机、输入处理、渲染 | 100% |
| `index.ts` | mock `ExtensionAPI`，测试工具注册、执行、结果组装 | 不纳入覆盖率 |
| `types.ts` | 类型定义 | 不纳入覆盖率 |

### 7.1 关键测试场景

1. 单选 + 自定义输入完成
2. 多选完成
3. preview 单选完成
4. 用户取消
5. 非 TUI 模式返回错误
6. 各种校验失败（问题数超限、选项过少、重复问题、重复选项、保留标签）
7. 多题 tab 导航与提交

---

## 8. 部署

- `bunx turbo run build` 构建到 `dist/index.js`
- `bun run deploy` 复制到 `~/.pi/agent/extensions/my-ask/index.js`
- 在 Pi 中 `/reload` 加载新扩展
- 先执行 `pi uninstall @juicesharp/rpiv-ask-user-question` 避免工具名冲突

---

## 9. 排除项（不做什么）

| 功能 | 排除原因 |
|---|---|
| i18n 多语言 | 本地使用，英文 UI 即可；减少依赖 |
| 外部事件通知 | 不需要外部监听 prompt 事件 |
| 配置化 guidance | 不需要自定义 prompt snippet/guidelines |
| 左右分栏 preview | 先以简单上下列表满足需求；后续如高频使用 preview 再升级 |

---

## 10. 变更日志

| 日期 | 变更 |
|---|---|
| 2026-06-12 | 确定替代方案、schema、UI 布局与测试策略 |
