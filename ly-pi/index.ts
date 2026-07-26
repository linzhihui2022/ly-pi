import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import myCdGuard from "./my-cd-guard/index";
import myPermission from "./my-permission/index";
import myScriptGuard from "./my-script-guard/index";

export default async function (pi: ExtensionAPI): Promise<void> {
  myCdGuard(pi);
  myScriptGuard(pi);
  await myPermission(pi);
}
