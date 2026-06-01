/**
 * Shared types for my-hud.
 */

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface SessionEntry {
  type: string;
  message?: {
    role: string;
    usage: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      cost: { total: number };
    };
  };
}

export interface StatusLineData {
  project: string;
  modelName: string;
  branch: string | null;
  ctxColored: string;
  usage: TokenUsage;
}
