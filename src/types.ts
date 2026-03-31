export type ReleaseChannel = "releases" | "tags";
export type ChangelogSourceType = "release_notes" | "changelog_file" | "compare_commits";
export type VersionSourceType = "package.json" | "pyproject.toml" | "file" | "literal";
export type ProblemKind = "code_bug" | "config_error" | "dependency_drift" | "upstream_update" | "unknown";

export type UpstreamFixMatch = {
  confidence: "low" | "medium" | "high";
  score: number;
  matchedHighlights: string[];
  recommendation: string;
};
export type RepairStrategy = "agent_patch" | "upstream_update" | "host_native_fix" | "manual_update" | "issue_only";
export type UpdateProviderKind = "update-kit" | "host-native" | "manual";
export type UddDecision =
  | "repair_once"
  | "always_auto_repair_safe"
  | "update_once"
  | "always_auto_update_safe"
  | "skip_this_time"
  | "ignore_this_version"
  | "issue_only";

export type CurrentVersionSource = {
  type: VersionSourceType;
  path?: string;
  key?: string;
  value?: string;
};

export type ChangelogSource = {
  type: ChangelogSourceType;
  path?: string;
};

export type IssueTemplate = {
  titlePrefix?: string;
  expectedFields?: string[];
};

export type UpgradeManifest = {
  $schemaVersion?: number;
  repo: string;
  releaseChannel: ReleaseChannel;
  currentVersionSource: CurrentVersionSource;
  changelogSource?: ChangelogSource;
  updateInstructions?: {
    command?: string;
    docsUrl?: string;
  };
  issueTemplates?: Record<string, IssueTemplate>;
  contributionPolicy?: {
    enabled: boolean;
    protectedPaths?: string[];
    maxChangedFiles?: number;
  };
  contribute?: ContributeConfig;
  privacyRules?: {
    redactPatterns?: string[];
    excludePaths?: string[];
  };
  selfHealing?: {
    enabled: boolean;
    strategyOrder?: RepairStrategy[];
    updateStrategyOrder?: UpdateProviderKind[];
    fallbackToIssue?: boolean;
    workspaceMode?: "git_worktree" | "inline";
    approvalMode?: "manual" | "safe_auto";
    maxAttempts?: number;
    autoSubmitPr?: boolean;
    draftPrByDefault?: boolean;
  };
  repair?: {
    allowPaths?: string[];
    protectedPaths?: string[];
    maxFilesChanged?: number;
  };
  hooks?: {
    preflight?: HookDefinition[];
    verification?: HookDefinition[];
    smoke?: HookDefinition[];
    compatibility?: HookDefinition[];
  };
  state?: {
    path?: string;
  };
  audit?: {
    path?: string;
  };
};

export type ConfirmationPrompt = {
  kind: "issue" | "contribution" | "github-write" | "repair" | "update";
  title: string;
  summary: string;
  preview?: string;
  options?: UddDecision[];
};

export type HostError = {
  message: string;
  stack?: string;
  code?: string;
};

export type HostContext = {
  cwd: string;
  appName: string;
  appVersion?: string;
  logs?: string[];
  error?: HostError;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  git?: {
    branch?: string;
    head?: string;
    changedFiles?: string[];
  };
  upstream?: {
    currentVersion?: string;
    latestVersion?: string;
    hasUpdate?: boolean;
    highlights?: string[];
    releaseUrl?: string;
  };
  confirm: (prompt: ConfirmationPrompt) => Promise<boolean>;
};

export type AdapterContextOverrides = Partial<Omit<HostContext, "confirm">> & {
  confirm?: HostContext["confirm"];
};

export type MatchUpstreamFixRequest = {
  error: HostError;
  highlights: string[];
  releaseUrl?: string;
  latestVersion?: string;
};

export type UddAdapter = {
  name: string;
  getContext: (overrides?: AdapterContextOverrides) => Promise<HostContext> | HostContext;
  decide?: (prompt: ConfirmationPrompt) => Promise<UddDecision>;
  runCommand?: (cmd: string[], cwd: string) => Promise<string>;
  invokeRepairAgent?: (request: RepairAgentRequest) => Promise<RepairAgentResult>;
  runHook?: (hook: HookDefinition, cwd: string) => Promise<HookExecutionResult>;
  getUpdateProviders?: () => Promise<UpdateProvider[]> | UpdateProvider[];
  matchUpstreamFix?: (request: MatchUpstreamFixRequest) => Promise<UpstreamFixMatch | undefined>;
  readState?: () => Promise<UddPersistentState | undefined>;
  writeState?: (state: UddPersistentState) => Promise<void>;
  writeAudit?: (record: AuditRecord) => Promise<void>;
};

export type GithubAuth = {
  token: string;
  apiBaseUrl?: string;
};

export type UpdateSummary = {
  currentVersion: string;
  latestVersion: string;
  shouldNotify: boolean;
  highlights: string[];
  releaseUrl?: string;
  compareUrl?: string;
  checkedAt: string;
  ignored: boolean;
};

export type UpdateCheckResult = UpdateSummary & {
  hasUpdate: boolean;
  message: string;
  upstreamFixMatch?: UpstreamFixMatch;
};

export type DiagnosticsAttachment = {
  name: string;
  path?: string;
  content: string;
};

export type IssueDraft = {
  owner: string;
  repo: string;
  title: string;
  body: string;
  reproductionSteps: string[];
  actualResult: string;
  expectedResult: string;
  environment: Record<string, string>;
  logSummary: string[];
  attemptedFixes: string[];
  attachments: DiagnosticsAttachment[];
  preview: string;
};

export type ContributionDraft = {
  owner: string;
  repo: string;
  allowed: boolean;
  blockedReasons: string[];
  branchName: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  diffStat: string;
  changedFiles: string[];
  patchPreview: string;
};

export type CheckForUpdatesOptions = {
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
  cachePath?: string;
  error?: HostError;
};

export type PrepareIssueDraftOptions = {
  issueType?: string;
  expectedResult?: string;
  reproductionSteps?: string[];
  attemptedFixes?: string[];
  additionalAttachments?: DiagnosticsAttachment[];
};

export type PrepareContributionDraftOptions = {
  summary?: string;
  rootCause?: string;
  validation?: string[];
  fetchRemote?: boolean;
};

export type SubmitIssueOptions = {
  fetchImpl?: typeof fetch;
};

export type SubmitContributionOptions = {
  remoteName?: string;
  baseBranch?: string;
  createPr?: boolean;
  fetchImpl?: typeof fetch;
  exec?: (cmd: string[], cwd: string) => Promise<string>;
};

export type HealthLoopHooks = {
  onUpdate?: (result: UpdateCheckResult) => Promise<void> | void;
  onIssueDraft?: (draft: IssueDraft) => Promise<void> | void;
  onContributionDraft?: (draft: ContributionDraft) => Promise<void> | void;
};

export type HookDefinition = {
  name: string;
  command?: string;
  timeoutMs?: number;
  required?: boolean;
  cwd?: string;
};

export type HookExecutionResult = {
  ok: boolean;
  output?: string;
};

export type Diagnosis = {
  kind: ProblemKind;
  confidence: number;
  summary: string;
  suggestedStrategies: RepairStrategy[];
  evidence: string[];
  upstreamFixMatch?: UpstreamFixMatch;
};

export type UpdateRequest = {
  repo: string;
  currentVersion?: string;
  targetVersion?: string;
  cwd: string;
  reason: string;
};

export type UpdateProviderPlan = {
  summary: string;
  targetVersion?: string;
};

export type UpdateProviderApplyResult = {
  ok: boolean;
  version?: string;
  details?: string;
};

export type UpdateProvider = {
  kind: UpdateProviderKind;
  isAvailable?: () => Promise<boolean> | boolean;
  plan?: (request: UpdateRequest) => Promise<UpdateProviderPlan>;
  apply?: (request: UpdateRequest) => Promise<UpdateProviderApplyResult>;
  describeManualSteps?: (request: UpdateRequest) => Promise<string[]>;
};

export type RepairAgentRequest = {
  incident: HostContext;
  diagnosis: Diagnosis;
  workspacePath: string;
  constraints?: {
    protectedPaths?: string[];
    maxFilesChanged?: number;
  };
};

export type RepairAgentResult = {
  ok: boolean;
  summary: string;
  changedFiles: string[];
  patchPreview?: string;
};

export type VerificationStepResult = {
  name: string;
  ok: boolean;
  output?: string;
};

export type VerificationStageResult = {
  stage: "preflight" | "verification" | "smoke" | "compatibility";
  steps: VerificationStepResult[];
};

export type VerificationResult = {
  ok: boolean;
  stages: VerificationStageResult[];
  failedStep?: string;
};

export type HealPlan = {
  incident: HostContext;
  diagnosis: Diagnosis;
  strategy: RepairStrategy;
  updateProviderKind?: UpdateProviderKind;
  manualUpdateSteps?: string[];
  updateTargetVersion?: string;
};

export type AuditRecord = {
  id: string;
  ts: string;
  appName: string;
  repo?: string;
  fromVersion?: string;
  toVersion?: string;
  step:
    | "incident_collected"
    | "diagnosis_completed"
    | "decision_recorded"
    | "repair_started"
    | "update_started"
    | "verification_completed"
    | "rollback_completed"
    | "pr_created"
    | "issue_created"
    | "contribution_pushed"
    | "contribution_pr_created";
  status: "ok" | "failed" | "skipped";
  message: string;
  metadata?: Record<string, unknown>;
};

export type UddPersistentState = {
  preferredDecision?: Extract<UddDecision, "always_auto_repair_safe" | "always_auto_update_safe">;
  ignoredVersions?: string[];
  lastHeal?: {
    status: "repaired" | "escalated" | "skipped";
    strategy?: RepairStrategy;
    summary: string;
    ts: string;
  };
};

export type HealOptions = AdapterContextOverrides & {
  auth?: GithubAuth;
  submitIssueOnEscalation?: boolean;
  createPr?: boolean;
};

export type ContributeStrategy = "direct_push" | "pull_request" | "auto";

export type ContributeIdentity = "owner" | "external" | "unknown";

export type ContributeConfig = {
  /** Default target branch (default: "main") */
  defaultTarget?: string;
  /** Push strategy: direct_push, pull_request, or auto (default: "direct_push").
   *  "auto" detects ownership by comparing git remote origin with upstream repo:
   *  - If origin matches upstream → owner → direct_push
   *  - If origin differs (fork) → external → pull_request */
  strategy?: ContributeStrategy;
  /** Run verification hooks before pushing (default: true) */
  requireVerification?: boolean;
  /** Upstream repo (owner/name) for external contributors to create PRs against.
   *  If omitted, defaults to manifest.repo. */
  upstream?: string;
  /** Auto-trigger contribute after a successful self-heal (default: false) */
  autoContributeAfterHeal?: boolean;
};

export type ContributeOptions = {
  /** Commit message (auto-generated from diff if omitted) */
  message?: string;
  /** Override push strategy for this invocation */
  strategy?: ContributeStrategy;
  /** Target branch (overrides config) */
  target?: string;
  /** GitHub auth for PR creation */
  auth?: GithubAuth;
  /** Skip verification hooks */
  skipVerification?: boolean;
  /** Git remote name (default: "origin") */
  remoteName?: string;
  /** Upstream remote name for PRs (default: "upstream", auto-added if needed) */
  upstreamRemoteName?: string;
  /** Custom exec function (for testing) */
  exec?: (cmd: string[], cwd: string) => Promise<string>;
};

export type ContributeResult =
  | {
      status: "pushed";
      branch: string;
      commitHash: string;
      summary: string;
      changedFiles: string[];
      verification?: VerificationResult;
    }
  | {
      status: "pr_created";
      branch: string;
      commitHash: string;
      prUrl: string;
      summary: string;
      changedFiles: string[];
      verification?: VerificationResult;
    }
  | {
      status: "blocked";
      reason: string;
      changedFiles: string[];
      verification?: VerificationResult;
    };

export type WatchOptions = {
  intervalMs?: number;
  checkUpstream?: boolean;
  healOnError?: boolean;
  healOptions?: HealOptions;
  maxCycles?: number;
};

export type WatchHandle = {
  stop: () => void;
  readonly running: boolean;
  readonly cycles: number;
};

export type HealResult =
  | {
      status: "repaired";
      summary: string;
      strategy: RepairStrategy;
      diagnosis: Diagnosis;
      verification: VerificationResult;
      contribution: ContributionDraft;
      branchUrl?: string;
      prUrl?: string;
      recommendation?: UpstreamFixMatch;
    }
  | {
      status: "escalated";
      summary: string;
      strategy: RepairStrategy;
      diagnosis: Diagnosis;
      issueDraft: IssueDraft;
      issueUrl?: string;
      recommendation?: UpstreamFixMatch;
    }
  | {
      status: "skipped";
      summary: string;
      strategy: RepairStrategy;
      diagnosis: Diagnosis;
      manualUpdateSteps?: string[];
      recommendation?: UpstreamFixMatch;
    };
