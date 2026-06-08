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
  overlayTextMap?: Record<string, OverlayTextConfig>;
}
