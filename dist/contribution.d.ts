import type { ContributionDraft, GithubAuth, HostContext, PrepareContributionDraftOptions, SubmitContributionOptions, UpgradeManifest } from "./types.js";
export declare function prepareContributionDraft(ctx: HostContext, manifest: UpgradeManifest, options?: PrepareContributionDraftOptions): Promise<ContributionDraft>;
export declare function submitContribution(ctx: HostContext, draft: ContributionDraft, auth: GithubAuth, options?: SubmitContributionOptions): Promise<{
    branchUrl?: string;
    prUrl?: string;
}>;
