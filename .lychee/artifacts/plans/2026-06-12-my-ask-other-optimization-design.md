# my-ask Other 选项交互优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `pi-extensions/my-ask/questionnaire.ts`，让 "Type something." 输入的自定义值变成列表中可见、可再次选择、可删除的 `(custom)` 行，并在单选/多选/多题模式下保持一致。

**Architecture:** 在 `questionnaire.ts` 内部新增 `customOptions` 状态保存每道题的自定义选项，推迟 `QuestionAnswer` 生成到最终按 Enter 提交时；`Row` 类型扩展 `custom` 分支，渲染和键盘处理均按普通选项对待；测试用 Vitest 以 TDD 方式补齐新分支与边界。

**Tech Stack:** TypeScript, Bun, Vitest, `@earendil-works/pi-tui`

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `pi-extensions/my-ask/questionnaire.ts` | 核心状态机：Row 类型、custom 状态、编辑器提交、选择/删除/渲染 |
| `pi-extensions/my-ask/questionnaire.test.ts` | 更新既有 custom 用例，新增删除/重复/上限/空输入/多选 custom 等测试 |

`types.ts`、`validate.ts`、`format.ts`、`index.ts` 均无需改动（返回值 schema 不变）。

---

### Task 1: 扩展 Row 类型并在列表中渲染 custom 行

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts:27-38`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`（新增/更新测试）

- [ ] **Step 1: 写失败测试——单选添加 custom 后不自动提交**

在 `questionnaire.test.ts` 中替换旧的 `"supports custom input via Type something row"` 测试：

```typescript
it("adds a custom row but does not auto-submit in single-select", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const done = vi.fn();
  const q = createQuestionnaire(params, mockTui, mockTheme, done);

  // focus Type something. and open editor
  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");

  q.handleInput("p");
  q.handleInput("i");
  q.handleInput("n");
  q.handleInput("k");
  q.handleInput("enter");

  expect(done).not.toHaveBeenCalled();
  const lines = q.render(80);
  expect(lines.some((l) => l.includes("3. pink (custom)"))).toBe(true);
  expect(lines.some((l) => l.includes("4. Type something."))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"adds a custom row but does not auto-submit in single-select" -v`
Expected: FAIL（列表中还没有 custom 行）

- [ ] **Step 2: 扩展 Row 类型并修改 buildRows**

在 `questionnaire.ts` 中：

```typescript
type Row =
  | { kind: "option"; option: OptionData; index: number }
  | { kind: "custom"; value: string }
  | { kind: "other" }
  | { kind: "chat" };
```

把 `buildRows` 改为接收 `questionIndex`，并在 other 行之前插入 custom 行；同时**多选也要显示 Type something.**：

```typescript
function buildRows(question: QuestionData, questionIndex: number): Row[] {
  const rows: Row[] = question.options.map((o, i) => ({ kind: "option", option: o, index: i }));
  const customs = customOptions.get(questionIndex) ?? [];
  for (const value of customs) {
    rows.push({ kind: "custom", value });
  }
  if (!hasPreview(question)) {
    rows.push({ kind: "other" });
  }
  rows.push({ kind: "chat" });
  return rows;
}
```

注意：上面的 `customOptions` 还未定义，将在 Task 2 中加入。

- [ ] **Step 3: 更新所有 currentRows() 调用**

把内部所有 `buildRows(currentQuestion())` 改为 `buildRows(currentQuestion(), currentTab)`。

- [ ] **Step 4: 运行测试确认失败原因变化**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"adds a custom row but does not auto-submit in single-select" -v`
Expected: 编译失败或测试失败（`customOptions` 未定义）

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): plan custom row type and buildRows"
```

---

### Task 2: 新增 customOptions 状态并重构编辑器提交

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 写失败测试——重复值焦点跳转**

```typescript
it("focuses existing custom row on duplicate value", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  // add "pink" once
  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("p");
  q.handleInput("i");
  q.handleInput("n");
  q.handleInput("k");
  q.handleInput("enter");

  // move to Type something. and enter "pink" again
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("p");
  q.handleInput("i");
  q.handleInput("n");
  q.handleInput("k");
  q.handleInput("enter");

  const lines = q.render(80);
  expect(lines.filter((l) => l.includes("pink (custom)")).length).toBe(1);
  expect(lines.some((l) => l.includes("> 3. pink (custom)"))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"focuses existing custom row on duplicate value" -v`
Expected: FAIL（没有 customOptions 去重逻辑）

- [ ] **Step 2: 新增状态变量和常量**

在 `createQuestionnaire` 函数体顶部、已有 `multiSelections` 之后新增：

```typescript
const MAX_CUSTOM_OPTIONS = 8;
const customOptions = new Map<number, string[]>();
let transientNotice: string | null = null;
```

- [ ] **Step 3: 重写 editor.onSubmit**

替换现有 `editor.onSubmit`：

```typescript
editor.onSubmit = (value) => {
  const index = inputQuestionIndex!;
  const trimmed = value.trim();
  inputMode = false;
  inputQuestionIndex = null;
  editor.setText("");

  if (trimmed.length === 0) {
    refresh();
    return;
  }

  const existing = customOptions.get(index) ?? [];
  const duplicateIndex = existing.indexOf(trimmed);
  if (duplicateIndex !== -1) {
    optionIndex = question.options.length + duplicateIndex;
    refresh();
    return;
  }

  if (existing.length >= MAX_CUSTOM_OPTIONS) {
    transientNotice = "Maximum 8 custom options reached";
    refresh();
    return;
  }

  existing.push(trimmed);
  customOptions.set(index, existing);

  if (questions[index].multiSelect) {
    getSelections(index).add(trimmed);
  }

  optionIndex = question.options.length + existing.length - 1;
  refresh();
};
```

注意：这里使用外层 `question` 变量需要改为使用 `questions[index]` 或在 Task 1 中移除该变量。如果 `question` 变量仍保留，需要确认它指向 `questions[inputQuestionIndex!]`。

- [ ] **Step 4: 添加 clearNotice 辅助函数并在输入开始时清除提示**

在 `handleInput` 的非 inputMode 分支开头调用：

```typescript
function clearNotice() {
  if (transientNotice) {
    transientNotice = null;
    refresh();
  }
}
```

在 `handleInput` 中：

```typescript
function handleInput(data: string) {
  if (inputMode) {
    // ... 保持不变
  }

  clearNotice();

  // ... 其余逻辑
}
```

- [ ] **Step 5: 运行重复值测试**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"focuses existing custom row on duplicate value" -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): store custom options and dedupe on submit"
```

---

### Task 3: 更新选择/提交逻辑以处理 custom 行

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts:145-190`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 写失败测试——单选选中 custom 行提交**

```typescript
it("selects a custom row and submits in single-select", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const done = vi.fn();
  const q = createQuestionnaire(params, mockTui, mockTheme, done);

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("p");
  q.handleInput("i");
  q.handleInput("n");
  q.handleInput("k");
  q.handleInput("enter");

  // custom row is focused, press Enter to submit
  q.handleInput("enter");

  expect(done).toHaveBeenCalledWith({
    answers: [{ questionIndex: 0, question: "Which color?", kind: "custom", answer: "pink" }],
    cancelled: false,
  });
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"selects a custom row and submits in single-select" -v`
Expected: FAIL（custom 行被当作 option 提交或报类型错误）

- [ ] **Step 2: 修改 selectCurrent**

在 `selectCurrent` 中，单选分支前加入 custom 处理：

```typescript
function selectCurrent() {
  const q = currentQuestion();
  const rows = currentRows();
  const row = rows[optionIndex];

  if (row.kind === "other") {
    inputMode = true;
    inputQuestionIndex = currentTab;
    editor.setText("");
    refresh();
    return;
  }

  if (row.kind === "chat") {
    saveAnswer({
      questionIndex: currentTab,
      question: q.question,
      kind: "chat",
      answer: CHAT_LABEL,
    });
    advanceAfterAnswer(currentTab);
    return;
  }

  if (q.multiSelect) {
    const selected = Array.from(getSelections(currentTab));
    saveAnswer({
      questionIndex: currentTab,
      question: q.question,
      kind: "multi",
      answer: null,
      selected,
    });
    advanceAfterAnswer(currentTab);
    return;
  }

  if (row.kind === "custom") {
    saveAnswer({
      questionIndex: currentTab,
      question: q.question,
      kind: "custom",
      answer: row.value,
    });
    advanceAfterAnswer(currentTab);
    return;
  }

  saveAnswer({
    questionIndex: currentTab,
    question: q.question,
    kind: "option",
    answer: row.option.label,
    preview: row.option.preview,
  });
  advanceAfterAnswer(currentTab);
}
```

- [ ] **Step 3: 运行测试**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"selects a custom row and submits in single-select" -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): submit custom rows as kind custom"
```

---

### Task 4: 实现 custom 行删除

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 写失败测试——Backspace 删除 custom 行**

```typescript
it("removes a custom row with backspace and moves focus up", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("p");
  q.handleInput("i");
  q.handleInput("n");
  q.handleInput("k");
  q.handleInput("enter");

  q.handleInput("backspace");

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("pink (custom)"))).toBe(false);
  expect(lines.some((l) => l.includes("> 2. Blue"))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"removes a custom row with backspace and moves focus up" -v`
Expected: FAIL（backspace 当前进入编辑器或无效）

- [ ] **Step 2: 导入 Key.backspace / Key.delete**

确保 `import { Editor, Key, matchesKey, truncateToWidth }` 中 `Key` 已导入；`Key.backspace` 与 `Key.delete` 在 `@earendil-works/pi-tui` 中可用。

- [ ] **Step 3: 实现 removeCustom 与键盘绑定**

新增函数：

```typescript
function removeCustom() {
  const rows = currentRows();
  const row = rows[optionIndex];
  if (row.kind !== "custom") return;

  const customs = customOptions.get(currentTab) ?? [];
  const idx = customs.indexOf(row.value);
  if (idx >= 0) {
    customs.splice(idx, 1);
    if (customs.length === 0) {
      customOptions.delete(currentTab);
    } else {
      customOptions.set(currentTab, customs);
    }
  }

  getSelections(currentTab).delete(row.value);

  optionIndex = Math.max(0, optionIndex - 1);
  const newRows = currentRows();
  optionIndex = Math.min(optionIndex, newRows.length - 1);
  refresh();
}
```

在 `handleInput` 的当前问题分支中加入：

```typescript
if (matchesKey(data, Key.delete) || matchesKey(data, Key.backspace)) {
  removeCustom();
  return;
}
```

- [ ] **Step 4: 运行删除测试**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"removes a custom row with backspace and moves focus up" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): delete focused custom rows with Del/Backspace"
```

---

### Task 5: 更新渲染逻辑与帮助栏

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 写失败测试——custom 行显示与帮助栏**

```typescript
it("shows Del remove hint when a custom row is focused", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("x");
  q.handleInput("enter");

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("x (custom)"))).toBe(true);
  expect(lines.some((l) => l.includes("Del remove"))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"shows Del remove hint when a custom row is focused" -v`
Expected: FAIL（帮助栏还没改）

- [ ] **Step 2: 修改 renderRows 渲染 custom 行并去掉 other 行的 ✎**

在 `renderRows` 中替换 other 分支并新增 custom 分支：

```typescript
if (row.kind === "other") {
  add(prefix + theme.fg(selected ? "accent" : "text", `${i + 1}. ${OTHER_LABEL}`));
  continue;
}

if (row.kind === "custom") {
  const label = `${row.value} (custom)`;
  const checked = q.multiSelect && getSelections(currentTab).has(row.value);
  const box = q.multiSelect ? (checked ? "☑" : "☐") : `${i + 1}.`;
  add(prefix + theme.fg(selected ? "accent" : "text", `${box} ${label}`));
  continue;
}
```

- [ ] **Step 3: 更新帮助栏与 transient notice 渲染**

在 `render` 函数中，非 inputMode 的帮助栏代码改为：

```typescript
const focused = rows[optionIndex];
const customFocused = focused.kind === "custom";
if (!inputMode) {
  let help: string;
  if (q.multiSelect) {
    help = customFocused
      ? " Space toggle • Del remove • Enter submit"
      : " Space toggle • Enter submit";
  } else {
    help = customFocused
      ? " ↑↓ navigate • Enter select • Del remove • Esc cancel"
      : " ↑↓ navigate • Enter select • Esc cancel";
  }
  add(theme.fg("dim", help));
}
```

在 render 的问题标题下方加入 transient notice：

```typescript
} else {
  const q = currentQuestion();
  add(theme.fg("text", ` ${q.question}`));
  lines.push("");
  if (transientNotice) {
    add(theme.fg("warning", ` ${transientNotice}`));
    lines.push("");
  }
  lines.push(...renderRows(width));

  const rows = currentRows();
  const focused = rows[optionIndex];
  if (!q.multiSelect && focused.kind === "option" && focused.option.preview) {
    lines.push("");
    lines.push(...renderPreview(focused.option.preview, width));
  }
}
```

- [ ] **Step 4: 运行帮助栏测试**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"shows Del remove hint when a custom row is focused" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): render custom rows and Del remove hints"
```

---

### Task 6: 多选模式支持 Type something. 与 custom 行

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.ts`
- Test: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 写失败测试——多选显示 Type something. 并添加 custom**

```typescript
it("shows Type something row for multi-select and adds checked custom row", () => {
  const params = makeParams([
    {
      question: "Which features?",
      header: "Features",
      multiSelect: true,
      options: [
        { label: "A", description: "a" },
        { label: "B", description: "b" },
      ],
    },
  ]);
  const done = vi.fn();
  const q = createQuestionnaire(params, mockTui, mockTheme, done);

  const linesBefore = q.render(80);
  expect(linesBefore.some((l) => l.includes("Type something."))).toBe(true);

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("x");
  q.handleInput("enter");

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("☑ x (custom)"))).toBe(true);

  q.handleInput("enter");

  expect(done).toHaveBeenCalledWith({
    answers: [
      { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: ["x"] },
    ],
    cancelled: false,
  });
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"shows Type something row for multi-select and adds checked custom row" -v`
Expected: FAIL（多选当前不显示 Type something.）

- [ ] **Step 2: 修改 toggleMulti 支持 custom 行**

替换 `toggleMulti`：

```typescript
function toggleMulti() {
  const rows = currentRows();
  const row = rows[optionIndex];
  if (row.kind !== "option" && row.kind !== "custom") return;

  const key = row.kind === "option" ? row.option.label : row.value;
  const set = getSelections(currentTab);
  if (set.has(key)) {
    set.delete(key);
  } else {
    set.add(key);
  }
  refresh();
}
```

- [ ] **Step 3: 运行多选测试**

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"shows Type something row for multi-select and adds checked custom row" -v`
Expected: PASS

- [ ] **Step 4: 更新旧测试——多选 sentinel Space 不 toggle**

找到现有测试 `"does not toggle when space is pressed on a sentinel row in multi-select"`，把移动 focus 到 chat 的 `down` 次数从 2 次改为 3 次：

```typescript
q.handleInput("down");
q.handleInput("down");
q.handleInput("down"); // A, B, Type something, Chat
q.handleInput("space");
q.handleInput("enter");
```

- [ ] **Step 5: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.ts pi-extensions/my-ask/questionnaire.test.ts
git commit -m "feat(my-ask): support Type something and custom rows in multi-select"
```

---

### Task 7: 边界测试补齐

**Files:**
- Modify: `pi-extensions/my-ask/questionnaire.test.ts`

- [ ] **Step 1: 空输入不添加 custom 行**

```typescript
it("does not add an empty custom row", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("enter"); // empty text

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("(custom)"))).toBe(false);
  expect(lines.some((l) => l.includes("3. Type something."))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"does not add an empty custom row" -v`
Expected: PASS（Task 2 已实现）

- [ ] **Step 2: 超过 8 个 custom 选项提示上限**

```typescript
it("shows a notice when custom option limit is reached", () => {
  const params = makeParams([
    {
      question: "Which color?",
      header: "Color",
      options: [
        { label: "Red", description: "Warm" },
        { label: "Blue", description: "Cool" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  // first custom: focus Type something. (down twice from Red)
  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("a");
  q.handleInput("enter");

  // add 7 more; after each addition focus is on the new custom row,
  // so only one down is needed to reach Type something.
  for (let i = 1; i < 8; i++) {
    q.handleInput("down");
    q.handleInput("enter");
    q.handleInput(String.fromCharCode(97 + i));
    q.handleInput("enter");
  }

  // 9th attempt should trigger the notice
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("z");
  q.handleInput("enter");

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("Maximum 8 custom options reached"))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"shows a notice when custom option limit is reached" -v`
Expected: PASS（Task 2 已实现）

- [ ] **Step 3: 多选 Space 切换 custom 行关闭**

```typescript
it("toggles a custom row off with space in multi-select", () => {
  const params = makeParams([
    {
      question: "Which features?",
      header: "Features",
      multiSelect: true,
      options: [
        { label: "A", description: "a" },
        { label: "B", description: "b" },
      ],
    },
  ]);
  const done = vi.fn();
  const q = createQuestionnaire(params, mockTui, mockTheme, done);

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("x");
  q.handleInput("enter");

  q.handleInput("space"); // toggle off

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("☐ x (custom)"))).toBe(true);

  q.handleInput("enter");
  expect(done).toHaveBeenCalledWith({
    answers: [
      { questionIndex: 0, question: "Which features?", kind: "multi", answer: null, selected: [] },
    ],
    cancelled: false,
  });
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"toggles a custom row off with space in multi-select" -v`
Expected: PASS

- [ ] **Step 4: 多题模式下 custom 行跨 tab 保留**

```typescript
it("preserves custom rows when switching tabs", () => {
  const params = makeParams([
    {
      question: "Q1?",
      header: "Q1",
      options: [
        { label: "A1", description: "a1" },
        { label: "B1", description: "b1" },
      ],
    },
    {
      question: "Q2?",
      header: "Q2",
      options: [
        { label: "A2", description: "a2" },
        { label: "B2", description: "b2" },
      ],
    },
  ]);
  const q = createQuestionnaire(params, mockTui, mockTheme, vi.fn());

  q.handleInput("down");
  q.handleInput("down");
  q.handleInput("enter");
  q.handleInput("x");
  q.handleInput("enter");

  q.handleInput("tab");
  q.handleInput("shift+tab");

  const lines = q.render(80);
  expect(lines.some((l) => l.includes("x (custom)"))).toBe(true);
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run questionnaire.test.ts::"preserves custom rows when switching tabs" -v`
Expected: PASS

- [ ] **Step 5: 更新 inline editor 测试（去掉 ✎）**

找到测试 `"renders the inline editor after selecting Type something"`，将断言：

```typescript
expect(lines.some((l) => l.includes("Type something. ✎"))).toBe(true);
```

改为：

```typescript
expect(lines.some((l) => l.includes("3. Type something."))).toBe(true);
```

- [ ] **Step 6: Commit**

```bash
git add pi-extensions/my-ask/questionnaire.test.ts
git commit -m "test(my-ask): cover custom row boundaries and multi-select"
```

---

### Task 8: 全量测试与覆盖率

**Files:**
- Test: `pi-extensions/my-ask/questionnaire.test.ts`, `validate.test.ts`, `format.test.ts`, `index.test.ts`

- [ ] **Step 1: 运行全量测试**

Run: `cd pi-extensions/my-ask && bunx vitest run --reporter=verbose`
Expected: 全部 PASS

- [ ] **Step 2: 检查覆盖率**

Run: `cd pi-extensions/my-ask && bunx vitest run --coverage`
Expected: `validate.ts`、`format.ts`、`questionnaire.ts` branches/functions/lines/statements 全部 100%

- [ ] **Step 3: 修复 coverage 缺口（常见点）**

若覆盖率不足，优先补测以下分支：

| 缺口 | 测试补充 |
|------|---------|
| `removeCustom` 中删除后 customs 为空分支 | 添加一个 custom 后立即删除 |
| `removeCustom` 中焦点 clamp 到 `newRows.length - 1` | 删除唯一 custom 行后确认焦点不越界 |
| 单选帮助栏非 custom focus 分支 | 已有测试覆盖，检查行号 |
| transient notice 清除分支 | 在显示 notice 后按任意方向键确认 notice 消失 |
| `Key.delete` 删除分支 | 复制 backspace 测试改用 `"delete"` |
| custom 行 toggle on 后再 toggle off | Task 7 Step 3 |

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-ask/
git commit -m "test(my-ask): achieve 100% coverage for custom option flow"
```

---

### Task 9: 构建与部署

**Files:**
- Deploy: `pi-extensions/my-ask/`

- [ ] **Step 1: 构建扩展**

Run: `bunx turbo run build`
Expected: `pi-extensions/my-ask/dist/index.js` 生成成功，无错误

- [ ] **Step 2: 一键部署**

Run: `bun run deploy`
Expected: 成功复制到 `~/.pi/agent/extensions/my-ask/index.js`

- [ ] **Step 3: 热重载验证**

在 Pi 中执行 `/reload`
Expected: 扩展加载成功

- [ ] **Step 4: 手动回归（可选）**

运行一个触发 `ask_user_question` 的 prompt：
1. 单选问题选择 "Type something." 输入自定义值
2. 确认列表中出现 `<value> (custom)` 且焦点落在该行
3. 按 Enter 提交该题
4. 多选问题确认 "Type something." 可用，输入后显示为勾选行
5. 在 custom 行按 Delete/Backspace 删除

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(my-ask): deploy Other option optimization" --allow-empty
```

---

### Task 10: 同步更新 LLM promptGuidelines

**Files:**
- Modify: `pi-extensions/my-ask/index.ts`

- [ ] **Step 1: 写失败测试（或静态检查）**

在 `index.test.ts` 中新增断言：

```typescript
it("promptGuidelines mention Type something for multi-select", () => {
  myAsk(mockPi);
  const guidelines = registeredTool.promptGuidelines.join(" ");
  expect(guidelines).toContain("multiSelect");
  expect(guidelines).not.toContain("suppresses the \"Type something.\" row on multi-select");
});
```

Run: `cd pi-extensions/my-ask && bunx vitest run index.test.ts::"promptGuidelines mention Type something for multi-select" -v`
Expected: FAIL（旧文案仍在）

- [ ] **Step 2: 修改 promptGuidelines**

找到 `index.ts` 中 `PROMPT_GUIDELINES` 数组，把涉及 multiSelect 的描述：

```
Set multiSelect: true when multiple answers are valid; this suppresses the "Type something." row.
```

改为：

```
Set multiSelect: true when multiple answers are valid; the "Type something." row is available in multi-select too, allowing users to add custom values alongside standard options.
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd pi-extensions/my-ask && bunx vitest run index.test.ts --reporter=verbose`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add pi-extensions/my-ask/index.ts index.test.ts
git commit -m "docs(my-ask): update promptGuidelines for multi-select custom options"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 自定义答案加入列表显示 → Task 1、Task 5
- [x] 单选 Enter 选中 custom 行提交 → Task 3
- [x] 多选 Space 切换 custom 行、Enter 提交 → Task 6
- [x] Delete/Backspace 删除 custom 行 → Task 4
- [x] 空输入不添加 → Task 2
- [x] 重复值去重并跳转焦点 → Task 2
- [x] 每题最多 8 个 custom 选项并提示 → Task 2
- [x] 删除后焦点移动 → Task 4
- [x] 多题 tab 切换保留 custom → Task 7
- [x] 帮助栏显示 `Del remove` → Task 5
- [x] preview 问题仍不显示 Type something. → `buildRows` 保留 `!hasPreview(question)` 判断
- [x] 返回值 schema 不变 → 未修改 `types.ts`
- [x] 同步更新 LLM promptGuidelines → Task 10

**2. Placeholder scan:** 无 TBD/TODO/implement later/"add appropriate error handling" 等占位符。

**3. Type consistency:**
- `Row` 类型在 Task 1 中统一定义，后续 `removeCustom`、`toggleMulti`、`renderRows`、`selectCurrent` 均使用 `kind === "custom"` 分支。
- `customOptions` 类型为 `Map<number, string[]>`，与 `multiSelections` 的 `Map<number, Set<string>>` 区分清晰。
- `QuestionAnswer` 仍通过 `kind: "custom"` 返回，与 `types.ts` 一致。

**4. 向后兼容风险：**
- 多选现在会显示 "Type something."，原有 `index.ts` 的 promptGuidelines 描述的是 "The 'Type something.' row is suppressed on multi-select questions"，**部署后需要同步更新** `index.ts` 的 promptGuidelines 文案，否则 LLM 会收到矛盾信息。
