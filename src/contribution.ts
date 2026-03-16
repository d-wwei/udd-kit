import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createGithubPullRequest } from "./github.js";
import type {
  ContributionDraft,
  GithubAuth,
  HostContext,
  PrepareContributionDraftOptions,
  SubmitContributionOptions,
  UpgradeManifest
} from "./types.js";
import { slugify, splitRepo } from "./utils.js";

const execFileAsync = promisify(execFile);

export async function prepareContributionDraft(
  ctx: HostContext,
  manifest: UpgradeManifest,
  options: PrepareContributionDraftOptions = {}
): Promise<ContributionDraft> {
  const { owner, repo } = splitRepo(manifest.repo);
  const changedFiles = await gitLines(["status", "--short"], ctx.cwd);
  const parsedFiles = changedFiles
    .map((line) => line.trim().slice(3))
    .filter(Boolean);
  const diffStat = await gitText(["diff", "--stat"], ctx.cwd);
  const patchPreview = await gitText(["diff", "--", ...parsedFiles.slice(0, 10)], ctx.cwd);
  const blockedReasons: string[] = [];

  if (!manifest.contributionPolicy?.enabled) {
    blockedReasons.push("Contribution policy disabled in manifest.");
  }
  const protectedPaths = manifest.contributionPolicy?.protectedPaths ?? [];
  const protectedHits = parsedFiles.filter((file) => protectedPaths.some((pattern) => file.includes(pattern.replace("*", ""))));
  if (protectedHits.length) {
    blockedReasons.push(`Protected paths changed: ${protectedHits.join(", ")}`);
  }
  const maxChangedFiles = manifest.contributionPolicy?.maxChangedFiles ?? 25;
  if (parsedFiles.length > maxChangedFiles) {
    blockedReasons.push(`Too many changed files (${parsedFiles.length}/${maxChangedFiles}).`);
  }
  if (!parsedFiles.length) {
    blockedReasons.push("No local changes detected.");
  }

  const summary = options.summary ?? ctx.error?.message ?? "local-fix";
  const rootCause = options.rootCause ?? "Root cause noted during local debugging.";
  const today = new Date().toISOString().slice(0, 10);
  const branchName = `auto-fix/${today}-${slugify(summary)}`;
  const commitMessage = `fix: ${summary}\n\nRoot cause: ${rootCause}`;
  const prTitle = `fix: ${summary}`;
  const validation = options.validation?.length
    ? options.validation.map((item) => `- ${item}`).join("\n")
    : "- Validation not captured yet";
  const prBody = [
    "## Problem",
    summary,
    "## Root Cause",
    rootCause,
    "## Validation",
    validation,
    "## Risk",
    blockedReasons.length ? blockedReasons.map((item) => `- ${item}`).join("\n") : "- Low"
  ].join("\n\n");

  return {
    owner,
    repo,
    allowed: blockedReasons.length === 0,
    blockedReasons,
    branchName,
    commitMessage,
    prTitle,
    prBody,
    diffStat: diffStat || "No diff stat available.",
    changedFiles: parsedFiles,
    patchPreview: patchPreview || "No patch preview available."
  };
}

export async function submitContribution(
  ctx: HostContext,
  draft: ContributionDraft,
  auth: GithubAuth,
  options: SubmitContributionOptions = {}
): Promise<{ branchUrl?: string; prUrl?: string }> {
  if (!draft.allowed) {
    throw new Error(`Contribution blocked: ${draft.blockedReasons.join("; ")}`);
  }
  const confirmed = await ctx.confirm({
    kind: "contribution",
    title: `Create branch and${options.createPr === false ? "" : " PR for"} ${draft.owner}/${draft.repo}?`,
    summary: draft.prTitle,
    preview: `${draft.prBody}\n\n${draft.diffStat}`
  });
  if (!confirmed) throw new Error("Contribution submission cancelled by user.");

  const exec = options.exec ?? defaultExec;
  await exec(["git", "checkout", "-b", draft.branchName], ctx.cwd);
  await exec(["git", "add", "."], ctx.cwd);
  await exec(["git", "commit", "-m", draft.commitMessage], ctx.cwd);
  const remoteName = options.remoteName ?? "origin";
  await exec(["git", "push", "-u", remoteName, draft.branchName], ctx.cwd);

  let prUrl: string | undefined;
  if (options.createPr !== false) {
    const pr = await createGithubPullRequest(
      `${draft.owner}/${draft.repo}`,
      {
        title: draft.prTitle,
        body: draft.prBody,
        head: draft.branchName,
        base: options.baseBranch ?? "main"
      },
      auth,
      options.fetchImpl ?? fetch
    );
    prUrl = pr.html_url;
  }

  return {
    branchUrl: `https://github.com/${draft.owner}/${draft.repo}/tree/${draft.branchName}`,
    prUrl
  };
}

async function gitLines(args: string[], cwd: string): Promise<string[]> {
  const raw = await gitText(args, cwd);
  return raw.split(/\r?\n/).filter(Boolean);
}

async function gitText(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function defaultExec(cmd: string[], cwd: string): Promise<string> {
  const [file, ...args] = cmd;
  const { stdout } = await execFileAsync(file, args, { cwd });
  return stdout.trim();
}
