import { ANSI as C } from "./ansi";

/** Format chief suggestion type for confirm dialog label. */
export function suggestionTypeLabel(type: string): string {
  switch (type) {
    case "add":
      return "新增规则";
    case "remove":
      return "删除规则";
    case "modify":
      return "改写规则";
    case "merge":
      return "合并规则";
    default:
      return type;
  }
}

/** Format chief suggestion detail for confirm dialog body. */
export function suggestionTypeDetail(item: {
  type: string;
  rule?: string;
  oldRule?: string;
  newRule?: string;
  oldRules?: string[];
  reason: string;
}): string {
  const parts: string[] = [];
  switch (item.type) {
    case "add":
      parts.push(`${C.bold}新增: ${item.rule}${C.reset}`);
      break;
    case "remove":
      parts.push(`${C.bold}删除: ${item.rule}${C.reset}`);
      break;
    case "modify":
      parts.push(`${C.bold}改写${C.reset}`);
      parts.push(`${C.red}− ${item.oldRule}${C.reset}`);
      parts.push(`${C.green}+ ${item.newRule}${C.reset}`);
      break;
    case "merge":
      parts.push(`${C.bold}合并${C.reset}`);
      for (const r of item.oldRules ?? []) {
        parts.push(`${C.red}− ${r}${C.reset}`);
      }
      parts.push(`${C.green}+ ${item.newRule}${C.reset}`);
      break;
  }
  parts.push(`${C.yellow}原因: ${item.reason}${C.reset}`);
  return parts.join("\n");
}
