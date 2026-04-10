import { UddEventBus } from "./events.js";
import type { AdapterContextOverrides, ContributeOptions, GithubAuth, HealOptions, HealthLoopHooks, PrepareContributionDraftOptions, PrepareIssueDraftOptions, SubmitContributionOptions, SubmitIssueOptions, UddAdapter, UpgradeManifest, WatchHandle, WatchOptions } from "./types.js";
export type RuntimeOptions = {
    cwd: string;
    manifestFile?: string;
    manifest?: UpgradeManifest;
};
export declare class UddRuntime {
    readonly cwd: string;
    readonly manifest: UpgradeManifest;
    readonly events: UddEventBus;
    constructor(options: {
        cwd: string;
        manifest: UpgradeManifest;
        events?: UddEventBus;
    });
    check(adapter: UddAdapter, overrides?: AdapterContextOverrides): Promise<import("./types.js").UpdateCheckResult>;
    prepareIssue(adapter: UddAdapter, options?: PrepareIssueDraftOptions & AdapterContextOverrides): Promise<import("./types.js").IssueDraft>;
    submitIssue(adapter: UddAdapter, draftOptions: PrepareIssueDraftOptions & AdapterContextOverrides, auth: GithubAuth, submitOptions?: SubmitIssueOptions): Promise<{
        url: string;
    }>;
    prepareContribution(adapter: UddAdapter, options?: PrepareContributionDraftOptions & AdapterContextOverrides): Promise<import("./types.js").ContributionDraft>;
    submitContribution(adapter: UddAdapter, draftOptions: PrepareContributionDraftOptions & AdapterContextOverrides, auth: GithubAuth, submitOptions?: SubmitContributionOptions): Promise<{
        branchUrl?: string;
        prUrl?: string;
    }>;
    run(adapter: UddAdapter, hooks?: HealthLoopHooks, options?: {
        issue?: PrepareIssueDraftOptions & AdapterContextOverrides;
        contribution?: PrepareContributionDraftOptions & AdapterContextOverrides;
    }): Promise<void>;
    analyze(adapter: UddAdapter, options?: HealOptions): Promise<import("./types.js").Diagnosis>;
    planHeal(adapter: UddAdapter, options?: HealOptions): Promise<import("./types.js").HealPlan>;
    heal(adapter: UddAdapter, options?: HealOptions): Promise<import("./types.js").HealResult>;
    watch(adapter: UddAdapter, options?: WatchOptions): WatchHandle;
    contribute(adapter: UddAdapter, options?: ContributeOptions & AdapterContextOverrides): Promise<import("./types.js").ContributeResult>;
    getState(adapter: UddAdapter): Promise<import("./types.js").UddPersistentState>;
    getAudit(_adapter: UddAdapter, limit?: number): Promise<import("./types.js").AuditRecord[]>;
}
export declare function createRuntime(options: RuntimeOptions): Promise<UddRuntime>;
