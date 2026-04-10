import type { HostContext, UpdateProvider, UpdateProviderKind, UpdateRequest, UddAdapter, UpgradeManifest } from "./types.js";
export declare function listAvailableUpdateProviders(adapter: UddAdapter): Promise<UpdateProvider[]>;
export declare function resolveUpdateProvider(adapter: UddAdapter, manifest: UpgradeManifest): Promise<UpdateProvider | undefined>;
export declare function planUpdateProvider(provider: UpdateProvider, request: UpdateRequest): Promise<{
    kind: UpdateProviderKind;
    manualSteps?: string[];
    targetVersion?: string;
}>;
export declare function buildUpdateRequest(ctx: HostContext, manifest: UpgradeManifest): UpdateRequest;
