import type { CheckForUpdatesOptions, HostContext, UpdateCheckResult, UpgradeManifest } from "./types.js";
export declare function detectCurrentVersion(cwd: string, manifest: UpgradeManifest): Promise<string>;
export declare function checkForUpdates(ctx: HostContext, manifest: UpgradeManifest, options?: CheckForUpdatesOptions): Promise<UpdateCheckResult>;
export declare function ignoreUpdateVersion(manifest: UpgradeManifest, version: string, options?: {
    cachePath?: string;
}): Promise<void>;
