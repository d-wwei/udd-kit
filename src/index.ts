export { loadManifest } from "./manifest.js";
export { checkForUpdates, detectCurrentVersion, ignoreUpdateVersion } from "./check.js";
export { prepareIssueDraft, submitIssue } from "./issue.js";
export { prepareContributionDraft, submitContribution } from "./contribution.js";
export { defineAdapter, resolveAdapterContext } from "./adapter.js";
export { UddRuntime, createRuntime } from "./runtime.js";
export { analyzeIncident, planHealing, healIncident } from "./self-heal.js";
export { matchChangelogToError } from "./match.js";
export { UddEventBus } from "./events.js";
export { createQuickAdapter, initUdd } from "./quick.js";

import type {
  HealthLoopHooks,
  HostContext,
  PrepareContributionDraftOptions,
  PrepareIssueDraftOptions,
  UpgradeManifest
} from "./types.js";
import { checkForUpdates } from "./check.js";
import { prepareContributionDraft } from "./contribution.js";
import { prepareIssueDraft } from "./issue.js";

export async function runHealthLoop(
  ctx: HostContext,
  manifest: UpgradeManifest,
  hooks: HealthLoopHooks = {},
  options: {
    issue?: PrepareIssueDraftOptions;
    contribution?: PrepareContributionDraftOptions;
  } = {}
): Promise<void> {
  const update = await checkForUpdates(ctx, manifest);
  if (update.shouldNotify) await hooks.onUpdate?.(update);
  if (ctx.error) {
    const issueDraft = await prepareIssueDraft(ctx, manifest, options.issue);
    await hooks.onIssueDraft?.(issueDraft);
  }
  const contributionDraft = await prepareContributionDraft(ctx, manifest, options.contribution);
  if (contributionDraft.changedFiles.length) {
    await hooks.onContributionDraft?.(contributionDraft);
  }
}

export type * from "./types.js";
export type { UddEventMap } from "./events.js";
export type { QuickAdapterOptions, InitUddOptions } from "./quick.js";
