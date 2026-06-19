import type { CheckResult } from "./checker.js";

export type DialogOption =
  | "Allow once"
  | "Allow for this session"
  | "Allow for this project"
  | "Deny"
  | "Deny with reason";

export type DialogResult =
  | { kind: "allow-once" }
  | { kind: "allow-session" }
  | { kind: "allow-project" }
  | { kind: "deny" }
  | { kind: "deny-with-reason"; reason: string };

export interface DialogUI {
  select(
    title: string,
    options: DialogOption[],
  ): Promise<DialogOption | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
}

const OPTIONS: DialogOption[] = [
  "Allow once",
  "Allow for this session",
  "Allow for this project",
  "Deny",
  "Deny with reason",
];

export async function askPermission(
  check: CheckResult,
  ui: DialogUI,
): Promise<DialogResult> {
  const title = `Permission required: ${check.surface} "${check.value}"`;
  const choice = await ui.select(title, OPTIONS);

  switch (choice) {
    case "Allow once":
      return { kind: "allow-once" };
    case "Allow for this session":
      return { kind: "allow-session" };
    case "Allow for this project":
      return { kind: "allow-project" };
    case "Deny":
      return { kind: "deny" };
    case "Deny with reason": {
      const reason = await ui.input("Deny reason", "Why is this denied?");
      if (reason === undefined || reason.trim().length === 0) {
        return { kind: "deny" };
      }
      return { kind: "deny-with-reason", reason };
    }
    default:
      return { kind: "deny" };
  }
}
