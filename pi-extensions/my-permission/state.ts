import type {
  PermissionConfig,
  PermissionEntry,
  PermissionStateSnapshot,
  PermissionSource,
} from "./types";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isValidSnapshot(value: unknown): value is PermissionStateSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return isStringArray(obj.deny);
}

export class PermissionState {
  private configDeny: string[] = [];
  private runtimeDeny: string[] | null = null;

  deny(tool: string): void {
    const current = this.effectiveDeny();
    if (current.includes(tool)) return;
    if (this.runtimeDeny === null) {
      this.runtimeDeny = [...current];
    }
    this.runtimeDeny.push(tool);
  }

  allow(tool: string): void {
    const current = this.effectiveDeny();
    if (!current.includes(tool)) return;
    if (this.runtimeDeny === null) {
      this.runtimeDeny = [...current];
    }
    this.runtimeDeny = this.runtimeDeny.filter((t) => t !== tool);
  }

  list(): PermissionEntry[] {
    const tools = this.effectiveDeny();
    return tools.map((tool) => {
      const source: PermissionSource = this.configDeny.includes(tool)
        ? "config"
        : "runtime";
      return { tool, source };
    });
  }

  reset(): void {
    this.runtimeDeny = null;
  }

  snapshot(): PermissionStateSnapshot {
    return { deny: this.effectiveDeny() };
  }

  static fromConfig(config: PermissionConfig): PermissionState {
    const state = new PermissionState();
    state.configDeny = [...config.deny];
    return state;
  }

  static fromEntries(
    entries: SessionEntry[],
    config: PermissionConfig,
  ): PermissionState {
    const state = PermissionState.fromConfig(config);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "custom") continue;
      if (entry.customType !== "my-permission") continue;
      if (!isValidSnapshot(entry.data)) continue;
      state.runtimeDeny = [...entry.data.deny];
      break;
    }
    return state;
  }

  private effectiveDeny(): string[] {
    return this.runtimeDeny ?? this.configDeny;
  }
}
