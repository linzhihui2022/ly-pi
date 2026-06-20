export type CommandResult =
  | { kind: "show" }
  | { kind: "start"; objective: string }
  | { kind: "edit"; objective: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "clear" };

export function parseGoalCommand(args: string): CommandResult | string {
  const trimmed = args.trim();
  if (trimmed === "") return { kind: "show" };
  const [first, ...rest] = trimmed.split(/\s+/);
  const restJoined = rest.join(" ").trim();

  if (first === "pause" && restJoined === "") return { kind: "pause" };
  if (first === "resume" && restJoined === "") return { kind: "resume" };
  if (first === "clear" && restJoined === "") return { kind: "clear" };
  if (first === "edit") {
    const objective = restJoined.trim();
    if (!objective) return "Usage: /goal edit <objective>";
    return { kind: "edit", objective };
  }
  return { kind: "start", objective: trimmed };
}
