import type { GithubAuth, HostContext, IssueDraft, PrepareIssueDraftOptions, SubmitIssueOptions, UpgradeManifest } from "./types.js";
export declare function prepareIssueDraft(ctx: HostContext, manifest: UpgradeManifest, options?: PrepareIssueDraftOptions): Promise<IssueDraft>;
export declare function submitIssue(ctx: HostContext, draft: IssueDraft, auth: GithubAuth, options?: SubmitIssueOptions): Promise<{
    url: string;
}>;
