import { Type, type Static } from "typebox";

export const PermissionValue = Type.Union([
  Type.Literal("ask"),
  Type.Literal("deny"),
  Type.Literal("allow"),
]);

export const PermissionRule = Type.Object({
  key: Type.String(),
  value: PermissionValue,
});

export const PermissionConfigSchema = Type.Object({
  permission: Type.Object({
    path: Type.Array(PermissionRule),
    bash: Type.Array(PermissionRule),
    tool: Type.Array(PermissionRule),
  }),
});

export type PermissionConfig = Static<typeof PermissionConfigSchema>;
export type PermissionRuleItem = Static<typeof PermissionRule>;
export type PermissionValueType = Static<typeof PermissionValue>;

export const PERMISSION_OPTIONS = [
  "Allow once",
  "Allow for this session",
  "Deny once",
  "Deny for this session",
] as const;
export type PermissionOption = (typeof PERMISSION_OPTIONS)[number];
