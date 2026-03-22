import { readAuditRecords } from "./audit.js";
import { checkForUpdates } from "./check.js";
import { prepareContributionDraft, submitContribution } from "./contribution.js";
import { prepareIssueDraft, submitIssue } from "./issue.js";
import { loadManifest } from "./manifest.js";
import { analyzeIncident, healIncident, planHealing } from "./self-heal.js";
import { readPersistentState } from "./state.js";
import type {
  AdapterContextOverrides,
  GithubAuth,
  HealOptions,
  HealthLoopHooks,
  PrepareContributionDraftOptions,
  PrepareIssueDraftOptions,
  SubmitContributionOptions,
  SubmitIssueOptions,
  UddAdapter,
  UpgradeManifest
} from "./types.js";
import { resolveAdapterContext } from "./adapter.js";

export type RuntimeOptions = {
  cwd: string;
  manifestFile?: string;
  manifest?: UpgradeManifest;
};

export class UddRuntime {
  readonly cwd: string;
  readonly manifest: UpgradeManifest;

  constructor(options: { cwd: string; manifest: UpgradeManifest }) {
    this.cwd = options.cwd;
    this.manifest = options.manifest;
  }

  async check(adapter: UddAdapter, overrides: AdapterContextOverrides = {}) {
    const ctx = await resolveAdapterContext(adapter, overrides);
    return checkForUpdates(ctx, this.manifest);
  }

  async prepareIssue(
    adapter: UddAdapter,
    options: PrepareIssueDraftOptions & AdapterContextOverrides = {}
  ) {
    const { confirm, ...overrides } = options;
    const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
    return prepareIssueDraft(ctx, this.manifest, options);
  }

  async submitIssue(
    adapter: UddAdapter,
    draftOptions: PrepareIssueDraftOptions & AdapterContextOverrides,
    auth: GithubAuth,
    submitOptions: SubmitIssueOptions = {}
  ) {
    const { confirm, ...overrides } = draftOptions;
    const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
    const draft = await prepareIssueDraft(ctx, this.manifest, draftOptions);
    return submitIssue(ctx, draft, auth, submitOptions);
  }

  async prepareContribution(
    adapter: UddAdapter,
    options: PrepareContributionDraftOptions & AdapterContextOverrides = {}
  ) {
    const { confirm, ...overrides } = options;
    const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
    return prepareContributionDraft(ctx, this.manifest, options);
  }

  async submitContribution(
    adapter: UddAdapter,
    draftOptions: PrepareContributionDraftOptions & AdapterContextOverrides,
    auth: GithubAuth,
    submitOptions: SubmitContributionOptions = {}
  ) {
    const { confirm, ...overrides } = draftOptions;
    const ctx = await resolveAdapterContext(adapter, { ...overrides, confirm });
    const draft = await prepareContributionDraft(ctx, this.manifest, draftOptions);
    return submitContribution(ctx, draft, auth, submitOptions);
  }

  async run(
    adapter: UddAdapter,
    hooks: HealthLoopHooks = {},
    options: {
      issue?: PrepareIssueDraftOptions & AdapterContextOverrides;
      contribution?: PrepareContributionDraftOptions & AdapterContextOverrides;
    } = {}
  ): Promise<void> {
    const update = await this.check(adapter);
    if (update.shouldNotify) await hooks.onUpdate?.(update);

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

  async analyze(adapter: UddAdapter, options: HealOptions = {}) {
    return analyzeIncident(adapter, this.manifest, options);
  }

  async planHeal(adapter: UddAdapter, options: HealOptions = {}) {
    return planHealing(adapter, this.manifest, options);
  }

  async heal(adapter: UddAdapter, options: HealOptions = {}) {
    return healIncident(adapter, this.manifest, options);
  }

  async getState(adapter: UddAdapter) {
    return readPersistentState(adapter, this.manifest, this.cwd);
  }

  async getAudit(_adapter: UddAdapter, limit = 20) {
    const records = await readAuditRecords(this.manifest, this.cwd);
    return records.slice(Math.max(records.length - limit, 0));
  }
}

export async function createRuntime(options: RuntimeOptions): Promise<UddRuntime> {
  const manifest = options.manifest ?? await loadManifest(options.cwd, options.manifestFile ?? "udd.config.json").catch(async () => {
    return loadManifest(options.cwd, options.manifestFile ?? "agent-upgrade.json");
  });
  return new UddRuntime({ cwd: options.cwd, manifest });
}
