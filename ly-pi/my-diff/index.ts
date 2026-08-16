/**
 * /diff — TUI diff viewer: pick a changed file from git status, view its diff vs HEAD.
 * Pure logic lives in git.ts/view.ts; this shell is excluded from coverage.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import {
  DynamicBorder,
  getSelectListTheme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  Text,
  type TUI,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { fetchChangedFiles, fetchDiffHead, fetchUntrackedContent } from "./git";
import type { ChangedFile, DiffView } from "./types";
import { buildDiffView, classifyDiffLine, formatListItem } from "./view";

export default function myDiff(pi: ExtensionAPI): void {
  pi.registerCommand("diff", {
    description: "选择工作区文件查看 diff（纯 TUI，不经过 agent）",
    handler: async (_args, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/diff 仅在交互模式下可用", "warning");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("请先中断当前操作，再执行 /diff", "warning");
        return;
      }

      const files = await fetchChangedFiles(ctx.cwd);
      if (files === null) {
        ctx.ui.notify("当前目录不是 git 仓库", "error");
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify("working tree clean", "info");
        return;
      }

      // Loop: pick a file → view diff → esc back to the list → esc again to quit.
      for (;;) {
        const picked = await pickFile(ctx, files);
        if (!picked) return;
        let raw: string;
        try {
          raw =
            picked.status === "?"
              ? await fetchUntrackedContent(ctx.cwd, picked.path)
              : await fetchDiffHead(ctx.cwd, picked.path);
        } catch {
          ctx.ui.notify(`读取 ${picked.path} 失败（可能已被删除）`, "error");
          continue;
        }
        await showDiff(ctx, buildDiffView(picked, raw));
      }
    },
  });
}

function pickFile(
  ctx: ExtensionCommandContext,
  files: ChangedFile[],
): Promise<ChangedFile | null> {
  const items: SelectItem[] = files.map((f) => ({
    value: f.path,
    label: formatListItem(f),
  }));

  return ctx.ui.custom<ChangedFile | null>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(
      new Text(theme.fg("accent", theme.bold("Changed files")), 1, 0),
    );
    const list = new SelectList(
      items,
      Math.min(items.length, 10),
      getSelectListTheme(),
    );
    list.onSelect = (item) =>
      done(files.find((f) => f.path === item.value) ?? null);
    list.onCancel = () => done(null);
    container.addChild(list);
    container.addChild(
      new Text(theme.fg("dim", "↑↓ navigate • enter diff • esc quit"), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    return {
      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

function showDiff(ctx: ExtensionCommandContext, view: DiffView): Promise<void> {
  return ctx.ui.custom<void>((tui, theme, _kb, done) => {
    return new DiffViewComponent(view, tui, theme, () => done());
  });
}

/** Scrollable, theme-colored diff view. Esc returns to the file list. */
class DiffViewComponent {
  private offset = 0;

  constructor(
    private readonly view: DiffView,
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly done: () => void,
  ) {}

  invalidate(): void {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) this.scrollBy(-1);
    else if (matchesKey(data, Key.down)) this.scrollBy(1);
    else if (matchesKey(data, Key.pageUp)) this.scrollBy(-this.pageSize());
    else if (matchesKey(data, Key.pageDown)) this.scrollBy(this.pageSize());
    else if (matchesKey(data, Key.escape)) this.done();
  }

  render(width: number): string[] {
    const budget = this.pageSize();
    const total = this.view.lines.length;
    const visible = this.view.lines.slice(this.offset, this.offset + budget);
    const progress =
      total > budget
        ? ` • ${this.offset + 1}-${Math.min(this.offset + budget, total)}/${total}`
        : "";
    return [
      this.theme.fg("accent", this.theme.bold(this.view.title)),
      ...visible.map((line) => this.colorize(line, width)),
      this.theme.fg("dim", `↑↓ scroll • PgUp/PgDn page • esc back${progress}`),
    ];
  }

  private pageSize(): number {
    // Title + footer + editor/footer chrome ≈ 8 reserved rows.
    return Math.max(3, this.tui.terminal.rows - 8);
  }

  private scrollBy(delta: number): void {
    const max = Math.max(0, this.view.lines.length - this.pageSize());
    this.offset = Math.min(Math.max(0, this.offset + delta), max);
    this.tui.requestRender();
  }

  private colorize(line: string, width: number): string {
    const kind = classifyDiffLine(line);
    const token =
      kind === "added"
        ? "toolDiffAdded"
        : kind === "removed"
          ? "toolDiffRemoved"
          : "toolDiffContext";
    return this.theme.fg(token, truncateToWidth(line, width));
  }
}
