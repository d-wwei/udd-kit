import type { Diagnosis, HostContext, UddAdapter, UpgradeManifest } from "./types.js";
export declare function diagnoseIncident(ctx: HostContext, manifest: UpgradeManifest, adapter?: UddAdapter): Promise<Diagnosis>;
