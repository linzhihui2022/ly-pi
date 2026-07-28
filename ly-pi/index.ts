import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myBack from "./my-back/index";
import { cdGuard } from "./my-cd-guard/index";
import myHtml from "./my-html/index";
import myHud from "./my-hud/index";
import myLog from "./my-log/index";
import myPermission from "./my-permission/index";
import myReload from "./my-reload/index";
import { scriptGuard } from "./my-script-guard/index";
import mySound from "./my-sound/index";
import { createGuardHarness } from "./shared/guard-harness";

export default async function (pi: ExtensionAPI): Promise<void> {
  createGuardHarness(pi, [cdGuard, scriptGuard]);
  myLog(pi);
  await myPermission(pi);
  myReload(pi);
  myBack(pi);
  myHtml(pi);
  mySound(pi);
  myHud(pi);
}
