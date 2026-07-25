export type FileTree = ReadonlyMap<string, string>;

export interface CheckContext {
  tree: FileTree;
  triageSkillInstalled: boolean;
}

export interface CheckResult {
  name: string;
  failures: string[];
}
