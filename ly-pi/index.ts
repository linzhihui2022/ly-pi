import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myBack from "./my-back/index";
import myBt from "./my-bt/index";
import myCdGuard from "./my-cd-guard/index";
import myHtml from "./my-html/index";
import myHud from "./my-hud/index";
import myLog from "./my-log/index";
import myPermission from "./my-permission/index";
import myReload from "./my-reload/index";
import myScriptGuard from "./my-script-guard/index";

export default async function (pi: ExtensionAPI): Promise<void> {
  myCdGuard(pi);
  myScriptGuard(pi);
  myLog(pi);
  await myPermission(pi);
  myReload(pi);
  myBack(pi);
  myHtml(pi);
  myBt(pi);
  myHud(pi);
}
