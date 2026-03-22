import type { Diagnosis, HostContext, RepairAgentResult, UddAdapter, UpgradeManifest } from "./types.js";

export async function runRepairAgent(
  adapter: UddAdapter,
  ctx: HostContext,
  diagnosis: Diagnosis,
  manifest: UpgradeManifest,
  workspacePath: string
): Promise<RepairAgentResult> {
  if (!adapter.invokeRepairAgent) {
    throw new Error("Repair agent is not available on this adapter.");
  }
  return adapter.invokeRepairAgent({
    incident: ctx,
    diagnosis,
    workspacePath,
    constraints: {
      protectedPaths: manifest.repair?.protectedPaths,
      maxFilesChanged: manifest.repair?.maxFilesChanged
    }
  });
}
