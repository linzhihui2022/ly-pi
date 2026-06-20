import { Type, type Static } from "typebox";

export const PermissionConfigSchema = Type.Object(
  {
    deny: Type.Array(Type.String(), { default: [] }),
  },
  { additionalProperties: false },
);

export type PermissionConfig = Static<typeof PermissionConfigSchema>;

export type PermissionSource = "config" | "runtime";

export interface PermissionEntry {
  tool: string;
  source: PermissionSource;
}

export interface PermissionStateSnapshot {
  deny: string[];
}
