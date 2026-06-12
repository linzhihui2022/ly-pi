# my-ask Other 选项交互优化设计

> 状态：已确认，可作为开发基准  
> 确认日期：2026-06-12  
> 目标：优化 `my-ask` 扩展中 "Type something."（Other）选项的交互，使其自定义答案可被再次查看、选择、删除。

---

## 1. 问题定义

当前实现中，单选问题选择 "Type something." 并输入内容后，该行会显示 `✎ <value>`，但再次在该行按 Enter 会直接提交答案，而不是进入编辑状态。用户预期是：既然显示为可编辑样式，就应该能再次编辑。

多选模式下虽然已将自定义值显示为额外勾选行，但单选模式缺乏对自定义答案的二次操作能力，导致交互不对称。

## 2. 设计原则

- **物化自定义答案**：用户输入的内容应成为选项列表中的可见、可操作项，而不是只作为摘要显示。
- **行为一致性**：自定义选项与普通选项的选中/提交行为一致；删除提供显式入口。
- **渐进改动**：在现有上下列表式基础上调整，不引入新的布局模式。
- **保留逃生口**："Chat about this" 与 Esc 取消行为不变。

## 3. 优化后的交互

### 3.1 单选模式

输入前：

```
 Which color?  [Color]

> 1. Red
  2. Blue
  3. Type something.
  4. Chat about this

 ↑↓ navigate • Enter select • Esc cancel
```

选中 "Type something.", Enter 后打开 inline editor，输入 "Purple"，再按 Enter：

```
 Which color?  [Color]

> 1. Red
  2. Blue
  3. Purple (custom)
  4. Type something.
  5. Chat about this

 ↑↓ navigate • Enter select • Esc cancel
```

此时：
- 不自动提交。
- "Purple (custom)" 与普通选项行为一致：Enter 选中并提交该题。
- 焦点落在新加入的 custom 行上，方便直接提交；也可继续上下切换。
- 在 custom 行按 Delete / Backspace 可移除该行。

### 3.2 多选模式

与单选类似，自定义值输入后加入列表作为一个 `[x] <value> (custom)` 行：

```
 Which features?  [Features]

> [x] Option A
  [x] Option B
  [ ] Type something.

 Space toggle • Enter submit
```

输入 "Custom feature" 后：

```
 Which features?  [Features]

  [x] Option A
  [x] Option B
> [x] Custom feature (custom)
  [ ] Type something.

 Space toggle • Enter submit
```

- Space 可切换 custom 行的勾选状态。
- Delete / Backspace 可移除 custom 行。
- Enter 提交当前所有已勾选项。

### 3.3 多题模式

每个问题的 custom 选项独立存储；切换 tab 后返回，已添加的 custom 行仍然保留。题目未提交前，答案状态以当前 focus/勾选为准，不是以是否按下 Enter 为准。

## 4. 数据结构变更

`questionnaire.ts` 内部维护的状态从 "单值 + 编辑器" 扩展为 "选项列表 + 自定义选项集合"：

- `customOptions: Map<number, string[]>` — 每道题已添加的自定义选项值列表（保持顺序，重复值去重）。
- `multiSelections: Map<number, Set<string>>` — 多选时记录当前勾选的选项值（包含标准选项与 custom 选项）。
- 单选不维护单独的选中状态：最终答案由 Enter 提交时焦点所在行决定。
- `editor` 继续负责 inline 输入，但提交后把值写入 `customOptions`，不再直接生成 `QuestionAnswer`。
- `QuestionAnswer` 的生成推迟到最终提交时：从当前 focus/勾选状态计算。

### 4.1 答案生成规则

| 场景 | 答案类型 | 说明 |
|---|---|---|
| 单选选中普通选项 | `kind: "option"` | `answer` 为选项 label，可带 `preview` |
| 单选选中 custom 行 | `kind: "custom"` | `answer` 为 custom 值 |
| 多选提交 | `kind: "multi"` | `selected` 包含所有勾选的标准选项与 custom 选项 |
| 选中 "Chat about this" | `kind: "chat"` | 不变 |

## 5. 边界与异常

- **空输入**：inline editor 中输入全空白并 Enter，不添加 custom 行，返回列表。
- **重复 custom 值**：同一题内相同值的 custom 行只保留一个；再次输入相同值时，焦点跳转到已有行并可选中它。
- **custom 行数量上限**：每道题最多允许 8 个自定义选项，避免列表无限增长。超过时给出提示并不再允许新增。
- **删除后焦点**：删除 custom 行后，焦点移动到上一个选项；若上方无选项则移动到 "Type something."。
- **预览问题**：存在 preview 的问题仍不显示 "Type something."，保持原 spec；custom 输入暂时不支持 preview 场景。
- **向后兼容**：schema、返回值类型、错误码均不变。

## 6. UI 细节

- custom 行后缀统一显示 `(custom)`，帮助用户识别来源。
- 当 custom 行被 focus 时，帮助栏追加 `"Del remove"` 提示；多选时帮助栏为 `"Space toggle • Del remove • Enter submit"`。
- 单题模式下帮助栏保持 `"↑↓ navigate • Enter select • Esc cancel"`，custom 行 focus 时增加 `"Del remove"`。

## 7. 测试策略

| 场景 | 测试重点 |
|---|---|
| 单选添加 custom 选项 | 输入后列表出现 custom 行；Enter 选中提交；返回值 kind 为 custom |
| 单选添加后删除 | Delete 移除 custom 行；删除后焦点位置正确 |
| 多选添加 custom 选项 | Space 可切换；Enter 提交时 selected 包含 custom 值 |
| 重复 custom 值 | 不重复添加，焦点跳转 |
| custom 行数量上限 | 超过 8 个后拒绝新增并提示 |
| 空输入 | 不添加行，停留在列表 |
| 多题切换 tab | custom 行状态保留 |
| 原有用例回归 | 普通选项、preview、chat、取消、校验等 |

覆盖率仍要求 `validate.ts`、`format.ts`、`questionnaire.ts` 100%。

## 8. 排除项

- 不引入左右分栏或弹窗编辑。
- 不支持对已有 custom 行直接按 Enter 编辑（删除后重新输入即可）。
- 不在 preview 问题中启用 "Type something."。

## 9. 变更日志

| 日期 | 变更 |
|---|---|
| 2026-06-12 | 确认 Other 选项优化方向：自定义答案加入列表、Enter 选中、Delete 删除 |
