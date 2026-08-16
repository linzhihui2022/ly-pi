/**
 * aboveEditor widget bar — displays session stats (project, model, tokens, cost, git status).
 */

import { homedir } from "node:os";
import { basename, join } from "node:path";
import type {
  ExtensionContext,
  ExtensionUIContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { contextColored } from "./format";
import { getGitStatus } from "./git";
import { getHideThinking } from "./hide-thinking";
import { getPullRequestNumber, getRemoteUrl, parseRemoteUrl } from "./pr";
import { buildStatusLine } from "./render";
import {
  aggregateJudgeCost,
  aggregateJudgeStats,
  extractEntryUsage,
} from "./session";
import type { GitStatus, PullRequestInfo, TokenUsage } from "./types";

const WIDGET_KEY = "my-hud-bar";
const GIT_STATUS_CACHE_TTL = 5000;
const PR_CACHE_TTL = 5000;
const DEFAULT_SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

export class Bar {
  constructor(private readonly settingsPath = DEFAULT_SETTINGS_PATH) {}
  private uiCtx: ExtensionUIContext | undefined;
  private ctx: ExtensionContext | undefined;
  private tui: TUI | undefined;
  private branch: string | null = null;
  private gitStatus: GitStatus | null = null;
  private gitStatusCacheTime = 0;
  private gitStatusRefreshPending = false;
  private pullRequest: PullRequestInfo | null = null;
  private pullRequestCacheTime = 0;
  private pullRequestRefreshPending = false;

  // Incremental session aggregation — only process new entries.
  private lastSeenIndex = 0;
  private runningUsage: TokenUsage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };
  private runningJudgeStats = { allowed: 0, denied: 0 };
  private runningJudgeCost = 0;
  private logEnabled = false;

  setBranch(branch: string | null): void {
    this.branch = branch;
  }

  setLogEnabled(enabled: boolean): void {
    this.logEnabled = enabled;
  }

  invalidatePullRequest(): void {
    this.pullRequestCacheTime = 0;
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
      { placement: "aboveEditor" },
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
    if (!this.ctx) return;
    const now = Date.now();
    if (now - this.gitStatusCacheTime <= GIT_STATUS_CACHE_TTL) return;
    if (this.gitStatusRefreshPending) return;

    this.gitStatusRefreshPending = true;
    const cwd = this.ctx.cwd;
    getGitStatus(cwd)
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

  private ensurePullRequest(): void {
    if (!this.branch) return;
    if (!this.ctx) return;
    const now = Date.now();
    if (now - this.pullRequestCacheTime <= PR_CACHE_TTL) return;
    if (this.pullRequestRefreshPending) return;

    this.pullRequestRefreshPending = true;
    const cwd = this.ctx.cwd;
    const branch = this.branch;
    getRemoteUrl(cwd, branch)
      .then((remoteUrl) => {
        if (!remoteUrl) return null;
        const repo = parseRemoteUrl(remoteUrl);
        if (!repo) return null;
        return getPullRequestNumber(
          cwd,
          branch,
          repo.owner,
          repo.repo,
          process.env.GITHUB_TOKEN,
        );
      })
      .then((pr) => {
        this.pullRequest = pr;
        this.pullRequestCacheTime = Date.now();
        this.requestRender();
      })
      .catch(() => {
        this.pullRequest = null;
        this.pullRequestCacheTime = Date.now();
      })
      .finally(() => {
        this.pullRequestRefreshPending = false;
      });
  }

  private renderWidget(theme: Theme, width: number): string[] {
    if (!this.ctx) return [];

    this.ensureGitStatus();
    this.ensurePullRequest();

    const entries = this.ctx.sessionManager.getEntries();
    if (entries.length < this.lastSeenIndex) {
      // Entries were truncated (e.g. session reset) — restart accumulation.
      this.runningUsage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      };
      this.runningJudgeStats = { allowed: 0, denied: 0 };
      this.runningJudgeCost = 0;
      this.lastSeenIndex = 0;
    }
    // Only process entries we haven't seen yet.
    const newEntries = entries.slice(this.lastSeenIndex);
    for (let i = this.lastSeenIndex; i < entries.length; i++) {
      const usage = extractEntryUsage(entries[i]);
      if (usage) {
        this.runningUsage.input += usage.input;
        this.runningUsage.output += usage.output;
        this.runningUsage.cacheRead += usage.cacheRead;
        this.runningUsage.cacheWrite += usage.cacheWrite;
        this.runningUsage.cost += usage.cost;
      }
    }
    const newJudgeStats = aggregateJudgeStats(newEntries);
    this.runningJudgeStats.allowed += newJudgeStats.allowed;
    this.runningJudgeStats.denied += newJudgeStats.denied;
    this.runningJudgeCost += aggregateJudgeCost(newEntries);
    this.lastSeenIndex = entries.length;
    const usage = this.runningUsage;

    const cu = this.ctx.getContextUsage();
    const ctxColored = contextColored(
      theme,
      cu?.percent ?? null,
      cu?.contextWindow ?? null,
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
      pullRequest: this.pullRequest,
      judgeStats: this.runningJudgeStats,
      judgeCost: this.runningJudgeCost,
      logEnabled: this.logEnabled,
      thinkingLevel: this.ctx.thinkingLevel,
      hideThinking: getHideThinking(this.settingsPath),
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
    this.pullRequest = null;
    this.pullRequestCacheTime = 0;
    this.pullRequestRefreshPending = false;
    this.lastSeenIndex = 0;
    this.runningUsage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    };
    this.runningJudgeStats = { allowed: 0, denied: 0 };
    this.runningJudgeCost = 0;
    this.logEnabled = false;
  }
}
