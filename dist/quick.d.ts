import { UddRuntime } from "./runtime.js";
import type { ConfirmationPrompt, HostError, UddAdapter, UpgradeManifest } from "./types.js";
export type QuickAdapterOptions = {
    name?: string;
    cwd?: string;
    appVersion?: string;
    logs?: string[];
    autoApprove?: boolean;
    onConfirm?: (prompt: ConfirmationPrompt) => Promise<boolean>;
    error?: HostError;
};
export declare function createQuickAdapter(options?: QuickAdapterOptions): UddAdapter;
export type InitUddOptions = QuickAdapterOptions & {
    manifestFile?: string;
    manifest?: UpgradeManifest;
};
export declare function initUdd(options?: InitUddOptions): Promise<{
    runtime: UddRuntime;
    adapter: UddAdapter;
}>;
