import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myBack from "./my-back/index";
import { cdGuard } from "./my-cd-guard/index";
import myDiff from "./my-diff/index";
import myHtml from "./my-html/index";
import myHud from "./my-hud/index";
import myLog from "./my-log/index";
import myPermission from "./my-permission/index";
import myReload from "./my-reload/index";
import { scriptGuard } from "./my-script-guard/index";
import mySessionName from "./my-session-name/index";
import mySound from "./my-sound/index";
import myVision from "./my-vision/index";
import { createGuardHarness } from "./shared/guard-harness";

export default async function (pi: ExtensionAPI): Promise<void> {
  createGuardHarness(pi, [cdGuard, scriptGuard]);
  myLog(pi);
  await myPermission(pi);
  myReload(pi);
  myBack(pi);
  myDiff(pi);
  myHtml(pi);
  mySound(pi);
  mySessionName(pi);
  myHud(pi);
  myVision(pi);
}
