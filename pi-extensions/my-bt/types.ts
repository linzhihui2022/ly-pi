export interface BtCategory {
  description: string;
  files: string[];
}

export interface BtConfig {
  enabled: boolean;
  soundDir: string;
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;
}
