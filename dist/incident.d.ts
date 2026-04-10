import type { AdapterContextOverrides, HostContext, UddAdapter, UpgradeManifest } from "./types.js";
export declare function collectIncidentContext(adapter: UddAdapter, manifest: UpgradeManifest, overrides?: AdapterContextOverrides): Promise<HostContext>;
