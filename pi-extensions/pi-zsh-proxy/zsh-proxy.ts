import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export interface TransformResult {
  action: "continue" | "transform";
  text?: string;
}

export function transformInput(text: string): TransformResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("$$")) {
    const cmd = trimmed.slice(2).trim();
    return { action: "transform", text: `!!${cmd}` };
  }
  if (trimmed.startsWith("$")) {
    const cmd = trimmed.slice(1).trim();
    return { action: "transform", text: `!${cmd}` };
  }
  return { action: "continue" };
}

export function createZshOperations() {
  const local = createLocalBashOperations();
  return {
    exec(command: string, cwd: string, options?: any) {
      const escaped = command.replace(/'/g, "'\\''");
      const wrapped = `zsh -ic '${escaped}'`;
      if (options !== undefined) {
        return local.exec(wrapped, cwd, options);
      }
      return local.exec(wrapped, cwd);
    },
  };
}
