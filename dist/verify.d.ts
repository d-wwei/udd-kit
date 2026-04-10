import type { HostContext, UddAdapter, UpgradeManifest, VerificationResult } from "./types.js";
export declare function runVerification(adapter: UddAdapter, manifest: UpgradeManifest, ctx: HostContext, cwd: string): Promise<VerificationResult>;
