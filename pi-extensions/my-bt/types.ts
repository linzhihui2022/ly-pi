export interface BtCategory {
  description: string;
  files: string[];
}

export interface BtConfig {
  soundDir: string;
  categories: Record<string, BtCategory>;
  eventMap: Record<string, string>;
}
