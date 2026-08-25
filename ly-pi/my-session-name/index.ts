import { readFile } from "node:fs/promises";
import type {
  ExtensionAPI,
  ExtensionContext,
  InputSource,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import {
  buildForkSessionName,
  getFirstUserPrompt,
  hasSessionNameAttempt,
  SESSION_NAME_ATTEMPT_CUSTOM_TYPE,
} from "./session-name";
import { requestSessionTitle } from "./title";

type UserInputSource = Extract<InputSource, "interactive" | "rpc">;

function isUserInputSource(
  source: InputSource | undefined,
): source is UserInputSource {
  return source === "interactive" || source === "rpc";
}

async function readSessionDisplayName(
  sessionFile: string | undefined,
): Promise<string | undefined> {
  if (!sessionFile) return undefined;

  try {
    const content = await readFile(sessionFile, "utf8");
    let latestName: string | undefined;
    for (const line of content.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      try {
        const entry: unknown = JSON.parse(line);
        if (
          !entry ||
          typeof entry !== "object" ||
          !("type" in entry) ||
          entry.type !== "session_info"
        ) {
          continue;
        }
        const name = "name" in entry ? entry.name : undefined;
        latestName =
          typeof name === "string" ? name.trim() || undefined : undefined;
      } catch {
        // Ignore malformed historical lines.
      }
    }
    return latestName;
  } catch {
    return undefined;
  }
}

export default function mySessionName(pi: ExtensionAPI): void {
  const pendingInputSources: InputSource[] = [];
  let sessionGeneration = 0;
  let titleAttempted = false;

  const getCurrentName = (): string | undefined => {
    try {
      return pi.getSessionName();
    } catch {
      return undefined;
    }
  };

  const markTitleAttempt = (ctx: ExtensionContext): void => {
    titleAttempted = true;
    try {
      pi.appendEntry(SESSION_NAME_ATTEMPT_CUSTOM_TYPE, {
        sessionId: ctx.sessionManager.getSessionId(),
      });
    } catch {
      // In-memory or stale sessions may not accept a persistence marker.
    }
  };

  const setGeneratedName = async (
    prompt: string,
    ctx: ExtensionContext,
    fork: boolean,
    generation: number,
  ): Promise<void> => {
    let title: string | null;
    try {
      title = await requestSessionTitle(prompt, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`会话标题模型策略加载失败: ${message}`, "error");
      return;
    }
    if (!title || generation !== sessionGeneration) return;

    try {
      if (pi.getSessionName()) return;
      const name = fork
        ? buildForkSessionName(title, ctx.sessionManager.getSessionId())
        : title;
      pi.setSessionName(name);
    } catch {
      // Session replacement can invalidate the captured extension context.
    }
  };

  const handleSessionStart = async (
    event: SessionStartEvent,
    ctx: ExtensionContext,
  ): Promise<void> => {
    sessionGeneration += 1;
    const generation = sessionGeneration;
    pendingInputSources.length = 0;
    const entries = ctx.sessionManager.getEntries();
    const sessionId = ctx.sessionManager.getSessionId();
    titleAttempted = hasSessionNameAttempt(entries, sessionId);

    if (event.reason === "fork") {
      const parentName = await readSessionDisplayName(
        event.previousSessionFile,
      );
      if (generation !== sessionGeneration) return;

      const currentName = parentName ?? getCurrentName();
      if (currentName) {
        try {
          pi.setSessionName(
            buildForkSessionName(
              currentName,
              ctx.sessionManager.getSessionId(),
            ),
          );
        } catch {
          // Session replacement can invalidate the captured extension context.
        }
        return;
      }

      const prompt = getFirstUserPrompt(entries);
      if (prompt && !titleAttempted) {
        markTitleAttempt(ctx);
        void setGeneratedName(prompt, ctx, true, generation);
      }
      return;
    }

    if (event.reason === "new") return;
    if (titleAttempted || getCurrentName()) return;

    const prompt = getFirstUserPrompt(entries);
    if (prompt) {
      markTitleAttempt(ctx);
      void setGeneratedName(prompt, ctx, false, generation);
    }
  };

  pi.on("session_start", handleSessionStart);

  pi.on("input", async (event) => {
    pendingInputSources.push(event.source);
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (titleAttempted || getCurrentName()) return;

    const source = pendingInputSources.shift();
    if (!isUserInputSource(source)) return;

    markTitleAttempt(ctx);
    void setGeneratedName(event.prompt, ctx, false, sessionGeneration);
  });
}
