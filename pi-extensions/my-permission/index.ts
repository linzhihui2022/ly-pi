import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPermissionCommands } from "./commands.js";
import { createPermissionChecker } from "./checker.js";
import { createConfigLoader } from "./config.js";
import { askPermission } from "./dialog.js";
import { createLogger } from "./logger.js";
import { createProjectRules } from "./project-rules.js";
import { createSessionState, type SessionRule } from "./session-state.js";
import { createSubagentPolicyManager } from "./subagent-policy.js";
import { createAgentPrepHandler } from "./handlers/agent-prep.js";
import { createLifecycleHandler } from "./handlers/lifecycle.js";
import { createToolCallHandler } from "./handlers/tool-call.js";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

export default function myPermission(pi: ExtensionAPI): void {
  const baseDir = path.join(
    os.homedir(),
    ".pi",
    "agent",
    "extensions",
    "my-permission",
  );
  const dataDir = path.join(os.homedir(), ".pi", "agent", "my-permission");
  const globalConfigPath = path.join(dataDir, "config.json");
  const projectsDir = dataDir;
  const logsDir = path.join(dataDir, "logs");
  const snapshotsDir = path.join(dataDir, "snapshots");
  const projectRules = createProjectRules(projectsDir);
  const configLoader = createConfigLoader({ globalConfigPath, projectRules });
  const sessionState = createSessionState();
  const logger = createLogger({ logsDir });

  const subagentPolicy = createSubagentPolicyManager({
    snapshotsDir,
    getSessionId: () =>
      fs.existsSync("/proc/self")
        ? "unknown" // actually would use pi session id
        : "unknown",
  });

  // Persist session rules into the session file.
  sessionState.onAppend = (rule: SessionRule) => {
    pi.appendEntry("my-permission:session-rule", rule);
  };

  const lifecycle = createLifecycleHandler({
    loadConfig: () => configLoader.loadConfig("."),
    sessionState,
    logger,
  });

  const toolCallHandler = createToolCallHandler({
    loadConfig: () => configLoader.loadConfig("."),
    sessionState,
    checkerFactory: (config, state) => createPermissionChecker(config, state),
    dialog: (check, ui) => askPermission(check, ui),
    logger,
    subagentPolicy,
    saveProjectRule: (cwd, surface, pattern) => {
      const config = configLoader.loadConfig(cwd);
      const key = surface === "tools" ? pattern : `${surface} ${pattern}`;
      projectRules.saveProjectConfig(cwd, { [surface]: { [key]: "allow" } });
    },
  });

  const agentPrepHandler = createAgentPrepHandler({
    loadConfig: () => configLoader.loadConfig("."),
  });

  pi.on("session_start", async (event, ctx) => {
    lifecycle.handleSessionStart(event, ctx);
  });

  pi.on("session_shutdown", async (event, ctx) => {
    lifecycle.handleSessionShutdown(event, ctx);
  });

  pi.on("before_agent_start", (event, ctx) => {
    return agentPrepHandler(event, ctx) as any;
  });

  pi.on("tool_call", async (event, ctx) => {
    return (await toolCallHandler(event, ctx)) as any;
  });

  registerPermissionCommands(pi, sessionState);
}
