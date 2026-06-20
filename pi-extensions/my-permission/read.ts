import type {
  ReadToolCallEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { PermissionState, type Action } from "./state";
import { promptPermission } from "./handler";

export class ReadPermission {
  constructor(
    public state: PermissionState,
    private event: ReadToolCallEvent,
    private ctx: ExtensionContext,
  ) {}

  check(): Action {
    if (!this.state.config) {
      return this.state.buildAction("config");
    }
    const path = this.event.input.path;
    const runtimeRule = this.state.matchPathRules(
      path,
      this.state.runtimeConfig.path,
    );
    if (runtimeRule) {
      return this.state.buildAction("runtime", runtimeRule);
    }
    const configRule = this.state.matchPathRules(
      path,
      this.state.config.permission.path,
    );
    return this.state.buildAction("config", configRule);
  }

  async handleAction(
    action: Action,
  ): Promise<{ block: true; reason: string } | undefined> {
    const label = `read ${this.event.input.path}`;
    switch (action.action) {
      case "allow":
        return undefined;
      case "deny":
        return {
          block: true,
          reason: `Denied ${label} by rule "${action.rule}" (${action.from})`,
        };
      case "ask":
        return promptPermission(
          this.ctx,
          label,
          () => {
            this.state.runtimeConfig.path.push({
              key: this.event.input.path,
              value: "allow",
            });
          },
          () => {
            this.state.runtimeConfig.path.push({
              key: this.event.input.path,
              value: "deny",
            });
          },
        );
    }
  }
}
