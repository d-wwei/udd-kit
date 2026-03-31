import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { writeAuditRecord } from "./audit.js";
import { createGithubPullRequest } from "./github.js";
import { runVerification } from "./verify.js";
import { slugify, splitRepo } from "./utils.js";
import type {
  ContributeOptions,
  ContributeResult,
  ContributeStrategy,
  HostContext,
  UddAdapter,
  UpgradeManifest
} from "./types.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string, exec?: ContributeOptions["exec"]): Promise<string> {
  if (exec) return exec(["git", ...args], cwd);
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/**
 * Detect local uncommitted changes (staged + unstaged), excluding internal paths.
 */
async function detectChanges(cwd: string, manifest: UpgradeManifest, exec?: ContributeOptions["exec"]): Promise<string[]> {
  const raw = await git(["status", "--short"], cwd, exec);
  if (!raw) return [];
  const internalPaths = new Set(
    [".udd/", manifest.state?.path, manifest.audit?.path]
      .filter((v): v is string => Boolean(v))
  );
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.trim().slice(3))
    .filter((file) => ![...internalPaths].some((p) => file === p || file.startsWith(p)))
    .filter(Boolean);
}

/**
 * Main contribute flow:
 * 1. Detect local changes
 * 2. Run verification hooks (if configured)
 * 3. Commit and push (direct or PR)
 * 4. Write audit record
 */
export async function contribute(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  ctx: HostContext,
  options: ContributeOptions = {}
): Promise<ContributeResult> {
  const exec = options.exec;
  const cwd = ctx.cwd;
  const remoteName = options.remoteName ?? "origin";

  // 1. Detect changes
  const changedFiles = await detectChanges(cwd, manifest, exec);
  if (!changedFiles.length) {
    return { status: "blocked", reason: "No local changes detected.", changedFiles: [] };
  }

  // Check contribution policy (protected paths, max files)
  const protectedPaths = manifest.contributionPolicy?.protectedPaths ?? [];
  const protectedHits = changedFiles.filter((file) =>
    protectedPaths.some((pattern) => file.includes(pattern.replace("*", "")))
  );
  if (protectedHits.length) {
    return {
      status: "blocked",
      reason: `Protected paths changed: ${protectedHits.join(", ")}`,
      changedFiles
    };
  }
  const maxFiles = manifest.contributionPolicy?.maxChangedFiles ?? 25;
  if (changedFiles.length > maxFiles) {
    return {
      status: "blocked",
      reason: `Too many changed files (${changedFiles.length}/${maxFiles}).`,
      changedFiles
    };
  }

  // 2. Run verification
  const skipVerification = options.skipVerification ?? !(manifest.contribute?.requireVerification ?? true);
  let verification;
  if (!skipVerification && manifest.hooks?.verification?.length) {
    verification = await runVerification(adapter, manifest, ctx, cwd);
    if (!verification.ok) {
      return {
        status: "blocked",
        reason: `Verification failed at step: ${verification.failedStep}`,
        changedFiles,
        verification
      };
    }
  }

  // 3. Determine strategy
  const strategy: ContributeStrategy = options.strategy ?? manifest.contribute?.strategy ?? "direct_push";
  const target = options.target ?? manifest.contribute?.defaultTarget ?? "main";

  // 4. Build commit message
  const diffStat = await git(["diff", "--stat"], cwd, exec);
  const message = options.message ?? `chore: contribute ${changedFiles.length} file(s)\n\n${diffStat}`;

  // 5. Stage and commit
  await git(["add", "."], cwd, exec);
  await git(["commit", "-m", message], cwd, exec);
  const commitHash = await git(["rev-parse", "HEAD"], cwd, exec);

  // 6. Push
  if (strategy === "direct_push") {
    const currentBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, exec);
    // If not on target branch, push current branch
    const pushBranch = currentBranch || target;
    await git(["push", remoteName, pushBranch], cwd, exec);

    await writeAuditRecord(adapter, manifest, ctx, {
      repo: manifest.repo,
      step: "contribution_pushed",
      status: "ok",
      message: `Direct push to ${pushBranch}: ${changedFiles.length} file(s)`,
      metadata: { branch: pushBranch, commitHash, changedFiles }
    });

    return {
      status: "pushed",
      branch: pushBranch,
      commitHash,
      summary: `Pushed ${changedFiles.length} file(s) to ${pushBranch}`,
      changedFiles,
      verification
    };
  }

  // PR strategy
  const { owner, repo } = splitRepo(manifest.repo);
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(options.message ?? "local-improvement");
  const branchName = `contribute/${today}-${slug}`;

  await git(["checkout", "-b", branchName], cwd, exec);
  await git(["push", "-u", remoteName, branchName], cwd, exec);

  let prUrl: string | undefined;
  if (options.auth) {
    const pr = await createGithubPullRequest(
      `${owner}/${repo}`,
      {
        title: options.message ?? `contribute: ${changedFiles.length} file(s)`,
        body: [
          "## Changes",
          changedFiles.map((f) => `- \`${f}\``).join("\n"),
          "",
          "## Diff",
          "```",
          diffStat,
          "```",
          "",
          verification ? `## Verification\nAll hooks passed.` : ""
        ].join("\n"),
        head: branchName,
        base: target
      },
      options.auth,
      fetch
    );
    prUrl = pr.html_url;
  }

  await writeAuditRecord(adapter, manifest, ctx, {
    repo: manifest.repo,
    step: prUrl ? "contribution_pr_created" : "contribution_pushed",
    status: "ok",
    message: prUrl ? `PR created: ${prUrl}` : `Branch pushed: ${branchName}`,
    metadata: { branch: branchName, commitHash, prUrl, changedFiles }
  });

  if (prUrl) {
    return {
      status: "pr_created",
      branch: branchName,
      commitHash,
      prUrl,
      summary: `PR created: ${prUrl}`,
      changedFiles,
      verification
    };
  }

  return {
    status: "pushed",
    branch: branchName,
    commitHash,
    summary: `Branch ${branchName} pushed to ${remoteName}`,
    changedFiles,
    verification
  };
}
