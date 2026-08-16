export interface SoundPack {
  soundDir: string;
  categories: Record<string, SoundCategory>;
}

export interface SoundCategory {
  description: string;
  files: string[];
}

export interface SoundConfig {
  enabled: boolean;
  activePack: string;
  packs: Record<string, SoundPack>;
  eventMap: Record<string, string>;
  /** Maps tool names (e.g. "ask_user_question") to sound categories */
  toolEventMap?: Record<string, string>;
  /** Maps permission event names (e.g. "permissions:ui_prompt") to sound categories */
  permissionEventMap?: Record<string, string>;
}
