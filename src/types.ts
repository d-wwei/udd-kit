export type ReleaseChannel = "releases" | "tags";
export type ChangelogSourceType = "release_notes" | "changelog_file" | "compare_commits";
export type VersionSourceType = "package.json" | "pyproject.toml" | "file" | "literal";

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
  privacyRules?: {
    redactPatterns?: string[];
    excludePaths?: string[];
  };
};

export type ConfirmationPrompt = {
  kind: "issue" | "contribution" | "github-write";
  title: string;
  summary: string;
  preview?: string;
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
  confirm: (prompt: ConfirmationPrompt) => Promise<boolean>;
};

export type AdapterContextOverrides = Partial<Omit<HostContext, "confirm">> & {
  confirm?: HostContext["confirm"];
};

export type UddAdapter = {
  name: string;
  getContext: (overrides?: AdapterContextOverrides) => Promise<HostContext> | HostContext;
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
