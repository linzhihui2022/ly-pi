// parser.test.ts
import { describe, it, expect } from "vitest";
import { parseDiff } from "./parser";

const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/src/auth.ts
@@ -0,0 +1,10 @@
+export function login(user: string, pass: string): boolean {
+  if (user === "admin" && pass === "secret") {
+    return true;
+  }
+  return false;
+}
+
+export function logout(): void {
+  console.log("logged out");
+}
diff --git a/src/api.ts b/src/api.ts
index abc1234..def5678 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -45,6 +45,7 @@ export async function fetchUser(id: string) {
   try {
     const res = await fetch(\`/api/users/\${id}\`);
     return res.json();
   } catch (e) {
+    console.error("fetch failed", e);
     return null;
   }
 }`;

describe("parseDiff", () => {
  it("parses added file", () => {
    const result = parseDiff(sampleDiff);
    const authFile = result.changedFiles.find((f) => f.path === "src/auth.ts");
    expect(authFile).toBeDefined();
    expect(authFile?.status).toBe("added");
    expect(authFile?.additions).toBe(10);
    expect(authFile?.deletions).toBe(0);
    expect(authFile?.hunks.length).toBe(1);
  });

  it("parses modified file", () => {
    const result = parseDiff(sampleDiff);
    const apiFile = result.changedFiles.find((f) => f.path === "src/api.ts");
    expect(apiFile).toBeDefined();
    expect(apiFile?.status).toBe("modified");
    expect(apiFile?.additions).toBe(1);
    expect(apiFile?.hunks.length).toBe(1);
  });

  it("calculates totals", () => {
    const result = parseDiff(sampleDiff);
    expect(result.totalFiles).toBe(2);
    expect(result.additions).toBe(11);
    expect(result.deletions).toBe(0);
  });

  it("returns empty for empty diff", () => {
    const result = parseDiff("");
    expect(result.totalFiles).toBe(0);
    expect(result.changedFiles).toEqual([]);
  });
});
