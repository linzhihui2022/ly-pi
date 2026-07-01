export interface BtCategory {
  description: string;
  files: string[];
}

export interface OverlayTextConfig {
  type: string;
  title: string;
  subtitle?: string;
}

export type OverlayColor = "blue" | "orange" | "green" | "red";

export interface BtConfig {
  enabled: boolean;
  soundDir: string;
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;
  /** Maps tool names (e.g. "ask_user_question") to sound categories */
  toolEventMap?: Record<string, string>;
  /** Maps permission event names (e.g. "permissions:ui_prompt") to sound categories */
  permissionEventMap?: Record<string, string>;
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
