export { loadManifest } from "./manifest.js";
export { checkForUpdates, detectCurrentVersion, ignoreUpdateVersion } from "./check.js";
export { prepareIssueDraft, submitIssue } from "./issue.js";
export { contribute, detectIdentity } from "./contribute.js";
export { prepareContributionDraft, submitContribution } from "./contribution.js";
export { defineAdapter, resolveAdapterContext } from "./adapter.js";
export { UddRuntime, createRuntime } from "./runtime.js";
export { analyzeIncident, planHealing, healIncident } from "./self-heal.js";
export { matchChangelogToError } from "./match.js";
export { UddEventBus } from "./events.js";
export { createQuickAdapter, initUdd } from "./quick.js";
import type { HealthLoopHooks, HostContext, PrepareContributionDraftOptions, PrepareIssueDraftOptions, UpgradeManifest } from "./types.js";
export declare function runHealthLoop(ctx: HostContext, manifest: UpgradeManifest, hooks?: HealthLoopHooks, options?: {
    issue?: PrepareIssueDraftOptions;
    contribution?: PrepareContributionDraftOptions;
}): Promise<void>;
export type * from "./types.js";
export type { UddEventMap } from "./events.js";
export type { QuickAdapterOptions, InitUddOptions } from "./quick.js";
