import { readAuditRecords } from "./audit.js";
import { checkForUpdates } from "./check.js";
import { contribute as contributeFlow } from "./contribute.js";
import { prepareContributionDraft, submitContribution } from "./contribution.js";
import { UddEventBus } from "./events.js";
import { prepareIssueDraft, submitIssue } from "./issue.js";
import { loadManifest } from "./manifest.js";
import { analyzeIncident, healIncident, planHealing } from "./self-heal.js";
import { readPersistentState } from "./state.js";
import { resolveAdapterContext } from "./adapter.js";
export class UddRuntime {
    cwd;
    manifest;
    events;
    constructor(options) {
        this.cwd = options.cwd;
        this.manifest = options.manifest;
        this.events = options.events ?? new UddEventBus();
    }
    async check(adapter, overrides = {}) {
        const ctx = await resolveAdapterContext(adapter, overrides);
        const result = await checkForUpdates(ctx, this.manifest, { error: ctx.error });
        if (result.shouldNotify) {
            this.events.emit("update:available", result);
        }
        if (result.upstreamFixMatch && ctx.error) {
            this.events.emit("update:fixes-local-error", {
                update: result,
                match: result.upstreamFixMatch,
                error: ctx.error
            });
        }
        return result;
    }
    async prepareIssue(adapter, options = {}) {
        const { confirm, ...overrides } = options;
        const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
        const draft = await prepareIssueDraft(ctx, this.manifest, options);
        this.events.emit("issue:drafted", draft);
        return draft;
    }
    async submitIssue(adapter, draftOptions, auth, submitOptions = {}) {
        const { confirm, ...overrides } = draftOptions;
        const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
        const draft = await prepareIssueDraft(ctx, this.manifest, draftOptions);
        return submitIssue(ctx, draft, auth, submitOptions);
    }
    async prepareContribution(adapter, options = {}) {
        const { confirm, ...overrides } = options;
        const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
        const draft = await prepareContributionDraft(ctx, this.manifest, options);
        if (draft.changedFiles.length) {
            this.events.emit("contribution:drafted", draft);
        }
        return draft;
    }
    async submitContribution(adapter, draftOptions, auth, submitOptions = {}) {
        const { confirm, ...overrides } = draftOptions;
        const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
        const draft = await prepareContributionDraft(ctx, this.manifest, draftOptions);
        return submitContribution(ctx, draft, auth, submitOptions);
    }
    async run(adapter, hooks = {}, options = {}) {
        const update = await this.check(adapter);
        if (update.shouldNotify)
            await hooks.onUpdate?.(update);
        const base = await resolveAdapterContext(adapter);
        if (base.error) {
            const issueDraft = await this.prepareIssue(adapter, {
                ...options.issue,
                error: base.error
            });
            await hooks.onIssueDraft?.(issueDraft);
        }
        const contributionDraft = await this.prepareContribution(adapter, options.contribution);
        if (contributionDraft.changedFiles.length) {
            await hooks.onContributionDraft?.(contributionDraft);
        }
    }
    async analyze(adapter, options = {}) {
        const diagnosis = await analyzeIncident(adapter, this.manifest, options);
        this.events.emit("diagnosis:completed", diagnosis);
        return diagnosis;
    }
    async planHeal(adapter, options = {}) {
        return planHealing(adapter, this.manifest, options);
    }
    async heal(adapter, options = {}) {
        let plan;
        try {
            plan = await planHealing(adapter, this.manifest, options);
            this.events.emit("heal:started", plan);
        }
        catch (err) {
            this.events.emit("heal:failed", { error: err instanceof Error ? err : new Error(String(err)) });
            throw err;
        }
        try {
            const result = await healIncident(adapter, this.manifest, options);
            this.events.emit("heal:completed", result);
            return result;
        }
        catch (err) {
            this.events.emit("heal:failed", { error: err instanceof Error ? err : new Error(String(err)), plan });
            throw err;
        }
    }
    watch(adapter, options = {}) {
        const intervalMs = options.intervalMs ?? 60_000;
        const checkUpstream = options.checkUpstream ?? true;
        const healOnError = options.healOnError ?? false;
        let running = true;
        let cycles = 0;
        const tick = async () => {
            if (!running)
                return;
            cycles++;
            this.events.emit("watch:tick", { ts: new Date().toISOString(), cycle: cycles });
            try {
                if (checkUpstream) {
                    await this.check(adapter);
                }
                const ctx = await resolveAdapterContext(adapter);
                if (ctx.error && healOnError) {
                    await this.heal(adapter, options.healOptions);
                }
                else if (ctx.error) {
                    await this.analyze(adapter);
                }
            }
            catch {
                // watch loop absorbs errors; events are emitted by inner methods
            }
            if (options.maxCycles && cycles >= options.maxCycles) {
                handle.stop();
            }
        };
        const timer = setInterval(tick, intervalMs);
        tick();
        const handle = {
            stop: () => {
                running = false;
                clearInterval(timer);
            },
            get running() { return running; },
            get cycles() { return cycles; }
        };
        return handle;
    }
    async contribute(adapter, options = {}) {
        const { confirm, ...overrides } = options;
        const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
        const result = await contributeFlow(adapter, this.manifest, ctx, options);
        if (result.status === "pushed" || result.status === "pr_created") {
            this.events.emit("contribution:drafted", {
                owner: "",
                repo: this.manifest.repo,
                allowed: true,
                blockedReasons: [],
                branchName: result.branch,
                commitMessage: options.message ?? "",
                prTitle: "",
                prBody: "",
                diffStat: "",
                changedFiles: result.changedFiles,
                patchPreview: ""
            });
        }
        return result;
    }
    async getState(adapter) {
        return readPersistentState(adapter, this.manifest, this.cwd);
    }
    async getAudit(_adapter, limit = 20) {
        const records = await readAuditRecords(this.manifest, this.cwd);
        return records.slice(Math.max(records.length - limit, 0));
    }
}
export async function createRuntime(options) {
    const manifest = options.manifest ?? await loadManifest(options.cwd, options.manifestFile ?? "udd.config.json").catch(async () => {
        return loadManifest(options.cwd, options.manifestFile ?? "agent-upgrade.json");
    });
    return new UddRuntime({ cwd: options.cwd, manifest });
}
