import type { GuardConfig } from "../shared/guard-harness";
import {
  buildConfirmMessage,
  buildReason,
  detectFileWriteBypass,
  detectInlineScript,
  type GuardDetection,
} from "./detector";

export { buildReason } from "./detector";

export const scriptGuard: GuardConfig<GuardDetection> = {
  name: "script-guard",
  detect: (command) =>
    detectInlineScript(command) ?? detectFileWriteBypass(command),
  react: (detection) => ({ block: true, reason: buildReason(detection) }),
  escalation: {
    threshold: 3,
    buildConfirm: buildConfirmMessage,
  },
};
