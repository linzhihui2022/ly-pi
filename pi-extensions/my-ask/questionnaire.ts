import { Editor, Key, matchesKey, truncateToWidth, type TUI as FullTUI } from "@earendil-works/pi-tui";
import type {
  OptionData,
  QuestionAnswer,
  QuestionData,
  QuestionParams,
  QuestionnaireResult,
} from "./types";

export interface TUI {
  requestRender(): void;
}

export interface Theme {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
}

export type Done = (result: QuestionnaireResult) => void;

type Row =
  | { kind: "option"; option: OptionData; index: number }
  | { kind: "custom"; value: string }
  | { kind: "other" }
  | { kind: "chat" };

const CHAT_LABEL = "Chat about this";
const OTHER_LABEL = "Type something.";

function hasPreview(question: QuestionData): boolean {
  return question.options.some((o) => typeof o.preview === "string" && o.preview.length > 0);
}

export function createQuestionnaire(
  params: QuestionParams,
  tui: TUI,
  theme: Theme,
  done: Done,
): {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
} {
  const questions = params.questions;
  const isMulti = questions.length > 1;
  const totalTabs = questions.length + 1;

  let currentTab = 0;
  let optionIndex = 0;
  let inputMode = false;
  let inputQuestionIndex: number | null = null;

  const MAX_CUSTOM_OPTIONS = 8;

  const answers = new Map<number, QuestionAnswer>();
  const multiSelections = new Map<number, Set<string>>();
  const customOptions = new Map<number, Set<string>>();
  let transientNotice: string | null = null;

  function clearNotice() {
    if (transientNotice) {
      transientNotice = null;
      refresh();
    }
  }

  function buildRows(question: QuestionData, questionIndex: number): Row[] {
    const rows: Row[] = question.options.map((o, i) => ({ kind: "option", option: o, index: i }));
    const customs = customOptions.get(questionIndex) ?? new Set<string>();
    for (const value of customs) {
      rows.push({ kind: "custom", value });
    }
    if (!hasPreview(question)) {
      rows.push({ kind: "other" });
    }
    rows.push({ kind: "chat" });
    return rows;
  }

  const editor = new Editor(tui as FullTUI, {
    borderColor: (s) => theme.fg("accent", s),
    selectList: {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    },
  });

  editor.onSubmit = (value) => {
    const index = inputQuestionIndex!;
    const trimmed = value.trim();
    inputMode = false;
    inputQuestionIndex = null;
    editor.setText("");

    if (trimmed === "") {
      refresh();
      return;
    }

    const customs = customOptions.get(index) ?? new Set<string>();
    const optionsLength = questions[index].options.length;

    if (customs.has(trimmed)) {
      const existingRowIndex = Array.from(customs).indexOf(trimmed);
      optionIndex = optionsLength + existingRowIndex;
      refresh();
      return;
    }

    if (customs.size >= MAX_CUSTOM_OPTIONS) {
      transientNotice = `Maximum ${MAX_CUSTOM_OPTIONS} custom options reached.`;
      refresh();
      return;
    }

    customs.add(trimmed);
    customOptions.set(index, customs);
    if (questions[index].multiSelect) {
      getSelections(index).add(trimmed);
    }

    optionIndex = optionsLength + customs.size - 1;
    refresh();
  };

  function refresh() {
    tui.requestRender();
  }

  function currentQuestion(): QuestionData {
    return questions[currentTab];
  }

  function currentRows(): Row[] {
    return buildRows(currentQuestion(), currentTab);
  }

  function isQuestionAnswered(index: number): boolean {
    return answers.has(index);
  }

  function allAnswered(): boolean {
    return questions.every((_, i) => isQuestionAnswered(i));
  }

  function getSelections(index: number): Set<string> {
    let set = multiSelections.get(index);
    if (!set) {
      set = new Set<string>();
      multiSelections.set(index, set);
    }
    return set;
  }

  function saveAnswer(answer: QuestionAnswer) {
    answers.set(answer.questionIndex, answer);
  }

  function buildResult(cancelled: boolean): QuestionnaireResult {
    return {
      answers: Array.from(answers.values()).sort((a, b) => a.questionIndex - b.questionIndex),
      cancelled,
    };
  }

  function submit(cancelled: boolean) {
    done(buildResult(cancelled));
  }

  function advanceAfterAnswer(index: number) {
    if (!isMulti) {
      submit(false);
      return;
    }
    if (index < questions.length - 1) {
      currentTab = index + 1;
    } else {
      currentTab = questions.length;
    }
    optionIndex = 0;
    refresh();
  }

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

  function toggleMulti() {
    const rows = currentRows();
    const row = rows[optionIndex];
    if (row.kind !== "option" && row.kind !== "custom") return;
    const set = getSelections(currentTab);
    const key = row.kind === "custom" ? row.value : row.option.label;
    if (set.has(key)) {
      set.delete(key);
    } else {
      set.add(key);
    }
    refresh();
  }

  function toggleAll() {
    const q = currentQuestion();
    /* istanbul ignore next -- only invoked from multi-select branch */
    if (!q.multiSelect) return;
    const rows = currentRows();
    const selectable = rows.filter((r) => r.kind === "option" || r.kind === "custom");
    const set = getSelections(currentTab);
    const allSelected = selectable.every((r) =>
      set.has(r.kind === "custom" ? r.value : r.option.label),
    );

    if (allSelected) {
      for (const r of selectable) {
        set.delete(r.kind === "custom" ? r.value : r.option.label);
      }
    } else {
      for (const r of selectable) {
        set.add(r.kind === "custom" ? r.value : r.option.label);
      }
    }
    refresh();
  }

  function removeCustom() {
    const rows = currentRows();
    const row = rows[optionIndex];
    if (row.kind !== "custom") return;

    const customs = customOptions.get(currentTab)!;
    customs.delete(row.value);
    if (customs.size === 0) {
      customOptions.delete(currentTab);
    } else {
      customOptions.set(currentTab, customs);
    }

    getSelections(currentTab).delete(row.value);

    optionIndex = Math.max(0, optionIndex - 1);
    const newRows = currentRows();
    optionIndex = Math.min(optionIndex, newRows.length - 1);
    refresh();
  }

  function switchTab(delta: number) {
    currentTab = (currentTab + delta + totalTabs) % totalTabs;
    optionIndex = 0;
    refresh();
  }

  function handleInput(data: string) {
    if (inputMode) {
      if (matchesKey(data, Key.escape)) {
        inputMode = false;
        inputQuestionIndex = null;
        editor.setText("");
        refresh();
        return;
      }
      editor.handleInput(data);
      refresh();
      return;
    }

    clearNotice();

    if (isMulti) {
      if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
        switchTab(1);
        return;
      }
      if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
        switchTab(-1);
        return;
      }
    }

    if (currentTab === questions.length) {
      if (matchesKey(data, Key.enter) && allAnswered()) {
        submit(false);
      } else if (matchesKey(data, Key.escape)) {
        submit(true);
      }
      return;
    }

    const rows = currentRows();

    if (matchesKey(data, Key.up)) {
      optionIndex = Math.max(0, optionIndex - 1);
      refresh();
      return;
    }
    if (matchesKey(data, Key.down)) {
      optionIndex = Math.min(rows.length - 1, optionIndex + 1);
      refresh();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      selectCurrent();
      return;
    }
    if (matchesKey(data, Key.space) && currentQuestion().multiSelect) {
      toggleMulti();
      return;
    }
    if (data === "a" && currentQuestion().multiSelect) {
      toggleAll();
      return;
    }
    if (matchesKey(data, Key.delete) || matchesKey(data, Key.backspace)) {
      removeCustom();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      submit(true);
    }
  }

  function renderPreview(preview: string, width: number): string[] {
    const lines: string[] = [];
    const innerWidth = Math.max(0, width - 4);
    const add = (s: string) => lines.push(truncateToWidth(s, width));

    add(theme.fg("muted", " Preview:"));
    add(theme.fg("border", `┌${"─".repeat(innerWidth)}┐`));
    for (const raw of preview.split("\n")) {
      const content = raw.length > innerWidth ? raw.slice(0, innerWidth) : raw;
      add(theme.fg("text", `│ ${content.padEnd(innerWidth)}│`));
    }
    add(theme.fg("border", `└${"─".repeat(innerWidth)}┘`));
    return lines;
  }

  function renderRows(width: number): string[] {
    const q = currentQuestion();
    const rows = currentRows();
    const lines: string[] = [];
    const add = (s: string) => lines.push(truncateToWidth(s, width));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const selected = i === optionIndex;
      const prefix = selected ? theme.fg("accent", "> ") : "  ";

      if (row.kind === "other") {
        add(prefix + theme.fg(selected ? "accent" : "text", `${i + 1}. ${OTHER_LABEL}`));
        continue;
      }

      if (row.kind === "chat") {
        add(prefix + theme.fg(selected ? "accent" : "text", `${i + 1}. ${CHAT_LABEL}`));
        continue;
      }

      if (row.kind === "custom") {
        const label = `${row.value} (custom)`;
        const checked = q.multiSelect && getSelections(currentTab).has(row.value);
        const box = q.multiSelect ? (checked ? "●" : "○") : `${i + 1}.`;
        add(prefix + theme.fg(selected ? "accent" : "text", `${box} ${label}`));
        continue;
      }

      const checked = q.multiSelect && getSelections(currentTab).has(row.option.label);
      const box = q.multiSelect ? (checked ? "●" : "○") : `${i + 1}.`;
      add(prefix + theme.fg(selected ? "accent" : "text", `${box} ${row.option.label}`));
      if (row.option.description) {
        add(`     ${theme.fg("muted", row.option.description)}`);
      }
    }

    return lines;
  }

  function render(width: number): string[] {
    const lines: string[] = [];
    const add = (s: string) => lines.push(truncateToWidth(s, width));

    add(theme.fg("accent", "─".repeat(width)));

    if (isMulti) {
      const tabs: string[] = ["← "];
      for (let i = 0; i < questions.length; i++) {
        const active = i === currentTab;
        const answered = isQuestionAnswered(i);
        const box = answered ? "■" : "□";
        const color = answered ? "success" : "muted";
        const text = ` ${box} ${questions[i].header} `;
        const styled = active
          ? theme.bg("selectedBg", theme.fg("text", text))
          : theme.fg(color, text);
        tabs.push(`${styled} `);
      }
      const canSubmit = allAnswered();
      const submitTab = currentTab === questions.length;
      const submitText = " ✓ Submit ";
      const submitStyled = submitTab
        ? theme.bg("selectedBg", theme.fg("text", submitText))
        : theme.fg(canSubmit ? "success" : "dim", submitText);
      tabs.push(`${submitStyled} →`);
      add(` ${tabs.join("")}`);
      lines.push("");
    }

    const q = currentTab === questions.length ? null : currentQuestion();

    if (currentTab === questions.length) {
      add(theme.fg("accent", theme.bold(" Ready to submit")));
      lines.push("");
      for (let i = 0; i < questions.length; i++) {
        const answer = answers.get(i);
        let value: string;
        if (!answer) {
          value = "(no input)";
        } else {
          switch (answer.kind) {
            case "multi":
              value = answer.selected?.length ? answer.selected.join(", ") : "(no input)";
              break;
            case "custom":
              /* istanbul ignore next -- custom answers submitted through the UI are never empty */
              value = answer.answer || "(no input)";
              break;
            case "chat":
              value = "Chat about this";
              break;
            default:
              value = answer.answer || "(no input)";
          }
        }
        add(`${theme.fg("muted", ` ${questions[i].header}: `)}${theme.fg("text", value)}`);
      }
      lines.push("");
      if (allAnswered()) {
        add(theme.fg("success", " Press Enter to submit"));
      } else {
        const missing = questions
          .filter((_, i) => !isQuestionAnswered(i))
          .map((q) => q.header)
          .join(", ");
        add(theme.fg("warning", ` Unanswered: ${missing}`));
      }
    } else if (inputMode) {
      const q = questions[inputQuestionIndex!];
      add(theme.fg("text", ` ${q.question}`));
      lines.push("");
      lines.push(...renderRows(width));
      lines.push("");
      add(theme.fg("muted", " Your answer:"));
      for (const line of editor.render(width - 2)) {
        add(` ${line}`);
      }
      lines.push("");
      add(theme.fg("dim", " Enter to submit • Esc to go back"));
    } else {
      add(theme.fg("text", ` ${q!.question}`));
      lines.push("");
      if (transientNotice) {
        add(theme.fg("warning", ` ${transientNotice}`));
        lines.push("");
      }
      lines.push(...renderRows(width));

      const rows = currentRows();
      const focused = rows[optionIndex];
      if (!q!.multiSelect && focused.kind === "option" && focused.option.preview) {
        lines.push("");
        lines.push(...renderPreview(focused.option.preview, width));
      }
    }

    lines.push("");
    if (!inputMode) {
      let help: string;
      if (currentTab === questions.length) {
        /* istanbul ignore else -- single-question mode submits immediately, so Submit tab is never rendered */
        if (isMulti) {
          help = " Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel";
        } else {
          help = " ↑↓ navigate • Enter select • Esc cancel";
        }
      } else {
        const rows = currentRows();
        const focused = rows[optionIndex];
        const customFocused = focused.kind === "custom";
        if (q!.multiSelect) {
          help = customFocused
            ? " Space toggle • a all/none • Del remove • Enter submit"
            : " Space toggle • a all/none • Enter submit";
        } else {
          help = customFocused
            ? " ↑↓ navigate • Enter select • Del remove • Esc cancel"
            : " ↑↓ navigate • Enter select • Esc cancel";
        }
      }
      add(theme.fg("dim", help));
    }
    add(theme.fg("accent", "─".repeat(width)));

    return lines;
  }

  function invalidate() {
    editor.invalidate();
  }

  return { render, handleInput, invalidate };
}
