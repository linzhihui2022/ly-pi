import type {
  BashToolCallEvent,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { PermissionState, type Action } from "./state";
import { promptPermission } from "./handler";

export class BashPermission {
  constructor(
    public state: PermissionState,
    private event: BashToolCallEvent,
    private ctx: ExtensionContext,
  ) {}

  check(): Action {
    if (!this.state.config) {
      return this.state.buildAction("config");
    }
    const command = this.event.input.command;
    const runtimeRule = this.state.matchBashRules(
      command,
      this.state.runtimeConfig.bash,
    );
    if (runtimeRule) {
      return this.state.buildAction("runtime", runtimeRule);
    }
    const configRule = this.state.matchBashRules(
      command,
      this.state.config.permission.bash,
    );
    return this.state.buildAction("config", configRule);
  }

  async handleAction(
    action: Action,
  ): Promise<{ block: true; reason: string } | undefined> {
    const label = `bash ${this.event.input.command}`;
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
            this.state.runtimeConfig.bash.push({
              key: this.event.input.command,
              value: "allow",
            });
          },
          () => {
            this.state.runtimeConfig.bash.push({
              key: this.event.input.command,
              value: "deny",
            });
          },
        );
    }
  }
}
