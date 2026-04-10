import type { Diagnosis, HostContext, RepairAgentResult, UddAdapter, UpgradeManifest } from "./types.js";
export declare function runRepairAgent(adapter: UddAdapter, ctx: HostContext, diagnosis: Diagnosis, manifest: UpgradeManifest, workspacePath: string): Promise<RepairAgentResult>;
