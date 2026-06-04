/**
 * aboveEditor widget bar — displays session stats (project, model, tokens, cost, git status).
 */

import type {
  ExtensionContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { basename } from "node:path";
import { aggregateSessionUsage } from "./session";
import { contextColored } from "./format";
import { buildStatusLine } from "./render";
import { getGitStatus } from "./git";
import type { GitStatus } from "./types";

const WIDGET_KEY = "my-hud-bar";
const GIT_STATUS_CACHE_TTL = 5000;

export class Bar {
  private uiCtx: ExtensionUIContext | undefined;
  private ctx: ExtensionContext | undefined;
  private tui: TUI | undefined;
  private branch: string | null = null;
  private gitStatus: GitStatus | null = null;
  private gitStatusCacheTime = 0;
  private gitStatusRefreshPending = false;

  setBranch(branch: string | null): void {
    this.branch = branch;
  }

  setContext(ctx: ExtensionContext): void {
    this.ctx = ctx;
  }

  setUICtx(ctx: ExtensionUIContext): void {
    if (ctx !== this.uiCtx) {
      this.uiCtx = ctx;
      this.tui = undefined;
    }
  }

  /** Register or refresh the widget. */
  update(): void {
    if (!this.uiCtx) return;

    this.uiCtx.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        this.tui = tui;
        return {
          render: (width: number) => this.renderWidget(theme, width),
          invalidate: () => {
            this.tui = undefined;
          },
        };
      },
      { placement: "aboveEditor" }
    );
  }

  requestRender(): void {
    this.tui?.requestRender();
  }

  /** Invalidate git status cache so next render triggers a fresh fetch. */
  invalidateGitStatus(): void {
    this.gitStatusCacheTime = 0;
  }

  private ensureGitStatus(): void {
    const now = Date.now();
    if (now - this.gitStatusCacheTime <= GIT_STATUS_CACHE_TTL) return;
    if (this.gitStatusRefreshPending) return;

    this.gitStatusRefreshPending = true;
    getGitStatus(this.ctx.cwd)
      .then((status) => {
        this.gitStatus = status;
        this.gitStatusCacheTime = Date.now();
        this.requestRender();
      })
      .catch(() => {
        this.gitStatus = null;
        this.gitStatusCacheTime = Date.now();
      })
      .finally(() => {
        this.gitStatusRefreshPending = false;
      });
  }

  private renderWidget(theme: Theme, width: number): string[] {
    if (!this.ctx) return [];

    this.ensureGitStatus();

    const entries = this.ctx.sessionManager.getEntries();
    const usage = aggregateSessionUsage(entries);

    const cu = this.ctx.getContextUsage();
    const ctxColored = contextColored(
      theme,
      cu?.percent ?? null,
      cu?.contextWindow ?? null
    );

    const modelName = this.ctx.model?.id ?? "no-model";
    const project = basename(this.ctx.cwd);

    const line = buildStatusLine(theme, width, {
      project,
      modelName,
      branch: this.branch,
      ctxColored,
      usage,
      gitStatus: this.gitStatus,
    });
    return [line];
  }

  dispose(): void {
    if (this.uiCtx) {
      this.uiCtx.setWidget(WIDGET_KEY, undefined);
    }
    this.tui = undefined;
    this.uiCtx = undefined;
    this.ctx = undefined;
    this.branch = null;
    this.gitStatus = null;
    this.gitStatusCacheTime = 0;
    this.gitStatusRefreshPending = false;
  }
}
