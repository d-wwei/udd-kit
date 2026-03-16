import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createGithubIssue } from "./github.js";
import { redactText } from "./redact.js";
import type {
  DiagnosticsAttachment,
  GithubAuth,
  HostContext,
  IssueDraft,
  PrepareIssueDraftOptions,
  SubmitIssueOptions,
  UpgradeManifest
} from "./types.js";
import { splitRepo } from "./utils.js";

export async function prepareIssueDraft(
  ctx: HostContext,
  manifest: UpgradeManifest,
  options: PrepareIssueDraftOptions = {}
): Promise<IssueDraft> {
  const issueType = options.issueType ?? "bug";
  const template = manifest.issueTemplates?.[issueType];
  const { owner, repo } = splitRepo(manifest.repo);
  const attachments = [
    ...(await collectLogAttachments(ctx, manifest)),
    ...(options.additionalAttachments ?? []).map((item) => ({
      ...item,
      content: redactText(item.content, manifest, ctx.cwd)
    }))
  ];
  const reproductionSteps = options.reproductionSteps ?? ["Run the failing workflow", "Observe the reported error"];
  const actualResult = redactText(ctx.error?.message ?? "Unknown runtime failure", manifest, ctx.cwd);
  const expectedResult = options.expectedResult ?? "The command should complete without errors.";
  const environment = {
    app: ctx.appName,
    appVersion: ctx.appVersion ?? "unknown",
    node: process.version,
    os: `${os.platform()} ${os.release()}`,
    cwd: "[PATH]",
    ...Object.fromEntries(
      Object.entries(ctx.metadata ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)])
    )
  };
  const logSummary = attachments.map((item) => `${item.name}: ${firstLine(item.content)}`);
  const attemptedFixes = options.attemptedFixes ?? [];
  const titlePrefix = template?.titlePrefix ?? "[Bug]";
  const title = `${titlePrefix} ${ctx.appName}: ${truncate(actualResult, 72)}`;
  const body = renderIssueMarkdown({
    title,
    reproductionSteps,
    actualResult,
    expectedResult,
    environment,
    logSummary,
    attemptedFixes,
    attachments
  });

  return {
    owner,
    repo,
    title,
    body,
    reproductionSteps,
    actualResult,
    expectedResult,
    environment,
    logSummary,
    attemptedFixes,
    attachments,
    preview: body
  };
}

export async function submitIssue(
  ctx: HostContext,
  draft: IssueDraft,
  auth: GithubAuth,
  options: SubmitIssueOptions = {}
): Promise<{ url: string }> {
  const confirmed = await ctx.confirm({
    kind: "issue",
    title: `Create issue in ${draft.owner}/${draft.repo}?`,
    summary: draft.title,
    preview: draft.preview
  });
  if (!confirmed) {
    throw new Error("Issue submission cancelled by user.");
  }

  const result = await createGithubIssue(
    `${draft.owner}/${draft.repo}`,
    draft.title,
    draft.body,
    auth,
    options.fetchImpl ?? fetch
  );
  return { url: result.html_url ?? "" };
}

async function collectLogAttachments(ctx: HostContext, manifest: UpgradeManifest): Promise<DiagnosticsAttachment[]> {
  const attachments: DiagnosticsAttachment[] = [];
  for (const logPath of ctx.logs ?? []) {
    if (isExcluded(logPath, manifest)) continue;
    try {
      const raw = await readFile(logPath, "utf8");
      attachments.push({
        name: path.basename(logPath),
        path: logPath,
        content: redactText(trimLog(raw), manifest, ctx.cwd)
      });
    } catch {
      continue;
    }
  }
  if (ctx.error?.stack) {
    attachments.push({
      name: "error-stack.txt",
      content: redactText(ctx.error.stack, manifest, ctx.cwd)
    });
  }
  return attachments;
}

function trimLog(raw: string): string {
  const lines = raw.split(/\r?\n/);
  return lines.slice(Math.max(lines.length - 60, 0)).join("\n");
}

function isExcluded(filePath: string, manifest: UpgradeManifest): boolean {
  return (manifest.privacyRules?.excludePaths ?? []).some((pattern) => filePath.includes(pattern.replace("*", "")));
}

function renderIssueMarkdown(params: {
  title: string;
  reproductionSteps: string[];
  actualResult: string;
  expectedResult: string;
  environment: Record<string, string>;
  logSummary: string[];
  attemptedFixes: string[];
  attachments: DiagnosticsAttachment[];
}): string {
  const envTable = Object.entries(params.environment)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const attachments = params.attachments
    .map((item) => `### ${item.name}\n\n\`\`\`\n${item.content}\n\`\`\``)
    .join("\n\n");

  return [
    `# ${params.title}`,
    "## Reproduction Steps",
    params.reproductionSteps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    "## Actual Result",
    params.actualResult,
    "## Expected Result",
    params.expectedResult,
    "## Environment",
    envTable,
    "## Log Summary",
    params.logSummary.length ? params.logSummary.map((line) => `- ${line}`).join("\n") : "- No logs attached",
    "## Attempted Fixes",
    params.attemptedFixes.length ? params.attemptedFixes.map((line) => `- ${line}`).join("\n") : "- None yet",
    attachments ? "## Attachments\n" + attachments : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find(Boolean) ?? "";
}
