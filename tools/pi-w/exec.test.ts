import { describe, expect, it } from "vitest";
import { realExec } from "./exec";

describe("realExec", () => {
  it("captures stdout and returns the exit code", async () => {
    const r = await realExec(["/bin/echo", "hi"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("hi\n");
  });

  it("returns non-zero exit codes without throwing", async () => {
    const r = await realExec(["/bin/sh", "-c", "exit 3"]);
    expect(r.code).toBe(3);
  });

  it("maps signal kills (null status) to exit code 1", async () => {
    const r = await realExec(["/bin/sh", "-c", "kill -TERM $$"]);
    expect(r.code).toBe(1);
  });

  it("returns 127 instead of throwing when the executable is missing", async () => {
    const r = await realExec(["definitely-not-a-real-command-piw"]);
    expect(r.code).toBe(127);
    expect(r.stdout).toBe("");
  });
});
