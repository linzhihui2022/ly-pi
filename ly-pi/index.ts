import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myBack from "./my-back/index";
import myBt from "./my-bt/index";
import myCdGuard from "./my-cd-guard/index";
import myHtml from "./my-html/index";
import myHud from "./my-hud/index";
import myPermission from "./my-permission/index";
import myScriptGuard from "./my-script-guard/index";
import { stopPreviewServer } from "./src/shared/preview";

export default async function (pi: ExtensionAPI): Promise<void> {
  myCdGuard(pi);
  myScriptGuard(pi);
  await myPermission(pi);
  myBack(pi);
  myHtml(pi);
  myBt(pi);
  myHud(pi);

  pi.on("session_shutdown", async () => {
    await stopPreviewServer();
  });
}
