import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { renderWorktreeLines } from "./render";
import { getVisibleWorktrees, type WorktreeSnapshot } from "./worktrees";

const WIDGET_KEY = "my-worktree";

export default function myWorktree(pi: ExtensionAPI): void {
  let active = false;
  let activeTui: TUI | undefined;
  let snapshot: WorktreeSnapshot | null = null;
  let refreshVersion = 0;
  let sessionVersion = 0;

  const requestRender = (): void => {
    activeTui?.requestRender();
  };

  const refresh = (ctx: ExtensionContext): void => {
    const version = ++refreshVersion;
    const session = sessionVersion;
    void getVisibleWorktrees(ctx.cwd).then(
      (nextWorktrees) => {
        if (
          !active ||
          session !== sessionVersion ||
          version !== refreshVersion
        ) {
          return;
        }
        snapshot =
          nextWorktrees && nextWorktrees.worktrees.length >= 2
            ? nextWorktrees
            : null;
        requestRender();
      },
      () => {
        if (
          !active ||
          session !== sessionVersion ||
          version !== refreshVersion
        ) {
          return;
        }
        snapshot = null;
        requestRender();
      },
    );
  };

  const render = (theme: Theme, width: number): string[] =>
    snapshot
      ? renderWorktreeLines(
          theme,
          snapshot.worktrees,
          width,
          snapshot.repositoryRoot,
        )
      : [];

  pi.on("session_start", (_event, ctx) => {
    sessionVersion++;
    active = ctx.hasUI;
    snapshot = null;
    if (!ctx.hasUI) return;

    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        activeTui = tui;
        return {
          render: (width: number) => render(theme, width),
          invalidate: () => {
            activeTui = undefined;
          },
        };
      },
      { placement: "aboveEditor" },
    );
    refresh(ctx);
  });

  pi.on("turn_start", (_event, ctx) => {
    if (active && ctx.hasUI) refresh(ctx);
  });

  pi.on("turn_end", (_event, ctx) => {
    if (active && ctx.hasUI) refresh(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!active) return;
    sessionVersion++;
    refreshVersion++;
    active = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    activeTui = undefined;
    snapshot = null;
  });
}
