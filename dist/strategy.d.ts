import type { Diagnosis, RepairStrategy, UddAdapter, UpgradeManifest } from "./types.js";
export declare function selectRepairStrategy(adapter: UddAdapter, diagnosis: Diagnosis, manifest: UpgradeManifest): Promise<RepairStrategy>;
