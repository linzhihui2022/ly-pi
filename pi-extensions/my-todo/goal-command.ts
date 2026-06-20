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

  if (first === "pause") return restJoined === "" ? { kind: "pause" } : "Usage: /goal pause";
  if (first === "resume") return restJoined === "" ? { kind: "resume" } : "Usage: /goal resume";
  if (first === "clear") return restJoined === "" ? { kind: "clear" } : "Usage: /goal clear";
  if (first === "edit") {
    const objective = restJoined.trim();
    if (!objective) return "Usage: /goal edit <objective>";
    return { kind: "edit", objective };
  }
  return { kind: "start", objective: trimmed };
}
