import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { stopPreviewServer } from "../web-preview/preview";
import {
  createCourtCostsCommand,
  createJudgeLogCommand,
  createSelfTestCommand,
} from "./commands";
import { loadFile } from "./file";
import { createToolCallInterceptor } from "./interceptor";
import { JUDGE_PROMPT } from "./judge-prompt";
import { createAdvocateTool } from "./tools/advocate";
import { createChiefTool } from "./tools/chief";
import { createProsecutorTool } from "./tools/prosecutor";
import { createSessionCache, isChildSession } from "./ui";

export default async function myPermission(pi: ExtensionAPI): Promise<void> {
  const judgePrompt = JUDGE_PROMPT;
  const localJudge = loadFile(join(process.cwd(), "JUDGE.md"));
  const cache = createSessionCache();
  const child = isChildSession();

  pi.registerCommand("judge-log", createJudgeLogCommand());
  pi.registerCommand("court-costs", createCourtCostsCommand());
  pi.registerCommand(
    "permission-self-test",
    createSelfTestCommand({ judgePrompt, localJudge }),
  );

  pi.registerTool(createAdvocateTool());
  pi.registerTool(createProsecutorTool());
  pi.registerTool(createChiefTool());

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });

  pi.on(
    "tool_call",
    createToolCallInterceptor({ pi, judgePrompt, localJudge, cache, child }),
  );
}
