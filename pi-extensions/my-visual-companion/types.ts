/** Actions the brainstorm_visual tool accepts. */
export type VisualAction =
  | { action: "show"; html: string; filename: string }
  | { action: "events" }
  | { action: "stop" };

/** A single browser click event. */
export interface ClickEvent {
  type: string;
  choice?: string;
  text?: string;
  timestamp: number;
}

/** Result returned to the AI after each tool call. */
export interface VisualResult {
  success: boolean;
  message: string;
  url?: string;
  events?: ClickEvent[];
}

/** Server lifecycle API (abstracted for testability). */
export interface ServerAPI {
  /** Start server if not running, write HTML, return URL. */
  show(html: string, filename: string): Promise<{ url: string }>;
  /** Read browser click events. */
  getEvents(): ClickEvent[];
  /** Stop the server. */
  stop(): Promise<void>;
  /** Whether the server is currently running. */
  isRunning(): boolean;
}
