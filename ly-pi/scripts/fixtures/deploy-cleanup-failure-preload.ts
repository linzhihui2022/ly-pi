import { mock } from "bun:test";
import * as fsPromises from "node:fs/promises";

const remove = fsPromises.rm;

mock.module("node:fs/promises", () => ({
  ...fsPromises,
  rm: async (...args: Parameters<typeof remove>) => {
    const [path] = args;
    if (String(path).includes(".ly-pi-") && String(path).endsWith(".tmp")) {
      throw new Error(`forced temporary cleanup failure: ${String(path)}`);
    }
    return remove(...args);
  },
}));
