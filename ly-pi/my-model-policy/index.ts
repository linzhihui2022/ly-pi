import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { loadModelPolicyRegistry } from "../model-policy/config";

const EXT_DIR = join(homedir(), ".pi", "agent", "extensions", "ly-pi");

type DoctorReport = {
  primary: { expected: string; actual?: string; deviates: boolean };
  roles: Record<
    string,
    {
      policy: string;
      failurePolicy: string;
      candidates: Array<{
        slot: string;
        model: string;
        label: string;
        thinking: string;
        source: string;
        status: string;
        diagnostics: string[];
      }>;
    }
  >;
};

function formatDoctorReport(report: DoctorReport): string {
  const lines = ["Models doctor"];
  lines.push(`Initial primary: ${report.primary.expected}`);
  if (report.primary.actual) {
    const suffix = report.primary.deviates ? " (deviates)" : "";
    lines.push(`Active primary: ${report.primary.actual}${suffix}`);
  }

  for (const [role, policy] of Object.entries(report.roles)) {
    lines.push(`${role} → ${policy.policy} (${policy.failurePolicy})`);
    for (const candidate of policy.candidates) {
      lines.push(
        `  ${candidate.slot}: ${candidate.model} [${candidate.label}] ${candidate.thinking} ${candidate.source} ${candidate.status}`,
      );
      for (const diagnostic of candidate.diagnostics) {
        lines.push(`    ! ${diagnostic}`);
      }
    }
  }
  return lines.join("\n");
}

export default function myModelPolicy(
  pi: ExtensionAPI,
  loadRegistry: () => {
    describe: (
      ctx: ExtensionContext["modelRegistry"],
      model: ExtensionContext["model"],
    ) => DoctorReport;
  } = () => loadModelPolicyRegistry(EXT_DIR),
): void {
  pi.registerCommand("models-doctor", {
    description: "Show model policy bindings and local capability diagnostics",
    handler: async (_args, ctx: ExtensionContext) => {
      try {
        const report = loadRegistry().describe(ctx.modelRegistry, ctx.model);
        ctx.ui.notify(
          formatDoctorReport(report),
          report.primary.deviates ? "warning" : "info",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Models doctor failed: ${message}`, "error");
      }
    },
  });
}
