import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { writeAuditRecord } from "./audit.js";
import { createGithubPullRequest } from "./github.js";
import { runVerification } from "./verify.js";
import { slugify, splitRepo } from "./utils.js";
import type {
  ContributeIdentity,
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
 * Extract owner/repo from a git remote URL.
 * Supports HTTPS (github.com/owner/repo) and SSH (git@github.com:owner/repo) formats.
 */
function parseRepoFromRemoteUrl(url: string): string | undefined {
  const match = url.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return match?.[1];
}

/**
 * Detect whether the current user is the repo owner or an external contributor.
 * Compares the git remote origin URL against the upstream/manifest repo.
 *
 * - owner: origin points to the same repo as upstream (direct push allowed)
 * - external: origin is a fork (should create PR against upstream)
 * - unknown: cannot determine (e.g. no remote, non-GitHub)
 */
export async function detectIdentity(
  cwd: string,
  manifest: UpgradeManifest,
  remoteName = "origin",
  exec?: ContributeOptions["exec"]
): Promise<{ identity: ContributeIdentity; originRepo?: string; upstreamRepo: string }> {
  const upstreamRepo = manifest.contribute?.upstream ?? manifest.repo;

  let originUrl: string;
  try {
    originUrl = await git(["remote", "get-url", remoteName], cwd, exec);
  } catch {
    return { identity: "unknown", upstreamRepo };
  }

  const originRepo = parseRepoFromRemoteUrl(originUrl);
  if (!originRepo) {
    return { identity: "unknown", upstreamRepo };
  }

  const isOwner = originRepo.toLowerCase() === upstreamRepo.toLowerCase();
  return {
    identity: isOwner ? "owner" : "external",
    originRepo,
    upstreamRepo
  };
}

/**
 * Resolve the effective push strategy based on config + identity detection.
 * "auto" mode: owner → direct_push, external/unknown → pull_request
 */
async function resolveStrategy(
  cwd: string,
  manifest: UpgradeManifest,
  explicitStrategy?: ContributeStrategy,
  remoteName?: string,
  exec?: ContributeOptions["exec"]
): Promise<{
  strategy: "direct_push" | "pull_request";
  identity: ContributeIdentity;
  originRepo?: string;
  upstreamRepo: string;
}> {
  const configStrategy = explicitStrategy ?? manifest.contribute?.strategy ?? "direct_push";

  // For explicit strategies, still detect identity for audit/logging
  const info = await detectIdentity(cwd, manifest, remoteName, exec);

  if (configStrategy === "direct_push" || configStrategy === "pull_request") {
    return { strategy: configStrategy, ...info };
  }

  // "auto" strategy
  if (info.identity === "owner") {
    return { strategy: "direct_push", ...info };
  }
  // external or unknown → pull_request (safer default)
  return { strategy: "pull_request", ...info };
}

/**
 * Ensure the upstream remote exists and points to the correct repo.
 * Used by external contributors who need to create PRs against the upstream.
 */
async function ensureUpstreamRemote(
  cwd: string,
  upstreamRepo: string,
  upstreamRemoteName: string,
  exec?: ContributeOptions["exec"]
): Promise<void> {
  const expectedUrl = `https://github.com/${upstreamRepo}.git`;
  try {
    const existingUrl = await git(["remote", "get-url", upstreamRemoteName], cwd, exec);
    const existingRepo = parseRepoFromRemoteUrl(existingUrl);
    if (existingRepo?.toLowerCase() !== upstreamRepo.toLowerCase()) {
      await git(["remote", "set-url", upstreamRemoteName, expectedUrl], cwd, exec);
    }
  } catch {
    // Remote doesn't exist, add it
    await git(["remote", "add", upstreamRemoteName, expectedUrl], cwd, exec);
  }
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
 * 2. Detect identity (owner vs external) and resolve strategy
 * 3. Run verification hooks (if configured)
 * 4. Commit and push (direct or PR to upstream)
 * 5. Write audit record
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
  const upstreamRemoteName = options.upstreamRemoteName ?? "upstream";

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

  // 2. Resolve strategy via identity detection
  const resolved = await resolveStrategy(cwd, manifest, options.strategy, remoteName, exec);
  const strategy = resolved.strategy;

  // 3. Run verification
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

  // 4. Determine target branch
  const target = options.target ?? manifest.contribute?.defaultTarget ?? "main";

  // 5. Build commit message
  const diffStat = await git(["diff", "--stat"], cwd, exec);
  const message = options.message ?? `chore: contribute ${changedFiles.length} file(s)\n\n${diffStat}`;

  // 6. Stage and commit
  await git(["add", "."], cwd, exec);
  await git(["commit", "-m", message], cwd, exec);
  const commitHash = await git(["rev-parse", "HEAD"], cwd, exec);

  // 7. Push
  if (strategy === "direct_push") {
    const currentBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd, exec);
    const pushBranch = currentBranch || target;
    await git(["push", remoteName, pushBranch], cwd, exec);

    await writeAuditRecord(adapter, manifest, ctx, {
      repo: manifest.repo,
      step: "contribution_pushed",
      status: "ok",
      message: `Direct push to ${pushBranch}: ${changedFiles.length} file(s) [identity: ${resolved.identity}]`,
      metadata: { branch: pushBranch, commitHash, changedFiles, identity: resolved.identity, originRepo: resolved.originRepo }
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

  // PR strategy — create branch and push to origin (or fork)
  const upstreamRepo = resolved.upstreamRepo;
  const today = new Date().toISOString().slice(0, 10);
  const slug = slugify(options.message ?? "local-improvement");
  const branchName = `contribute/${today}-${slug}`;

  await git(["checkout", "-b", branchName], cwd, exec);
  await git(["push", "-u", remoteName, branchName], cwd, exec);

  let prUrl: string | undefined;
  if (options.auth) {
    if (resolved.identity === "external" && resolved.originRepo) {
      // External contributor: ensure upstream remote exists, create cross-repo PR
      await ensureUpstreamRemote(cwd, upstreamRepo, upstreamRemoteName, exec);
      const { owner: forkOwner } = splitRepo(resolved.originRepo);
      const pr = await createGithubPullRequest(
        upstreamRepo,
        {
          title: options.message ?? `contribute: ${changedFiles.length} file(s)`,
          body: buildPrBody(changedFiles, diffStat, verification, resolved.identity, resolved.originRepo),
          head: `${forkOwner}:${branchName}`,
          base: target
        },
        options.auth,
        fetch
      );
      prUrl = pr.html_url;
    } else {
      // Owner creating PR on their own repo
      const pr = await createGithubPullRequest(
        upstreamRepo,
        {
          title: options.message ?? `contribute: ${changedFiles.length} file(s)`,
          body: buildPrBody(changedFiles, diffStat, verification, resolved.identity),
          head: branchName,
          base: target
        },
        options.auth,
        fetch
      );
      prUrl = pr.html_url;
    }
  }

  await writeAuditRecord(adapter, manifest, ctx, {
    repo: manifest.repo,
    step: prUrl ? "contribution_pr_created" : "contribution_pushed",
    status: "ok",
    message: prUrl ? `PR created: ${prUrl}` : `Branch pushed: ${branchName}`,
    metadata: {
      branch: branchName,
      commitHash,
      prUrl,
      changedFiles,
      identity: resolved.identity,
      originRepo: resolved.originRepo,
      upstreamRepo
    }
  });

  if (prUrl) {
    return {
      status: "pr_created",
      branch: branchName,
      commitHash,
      prUrl,
      summary: `PR created against ${upstreamRepo}: ${prUrl}`,
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

function buildPrBody(
  changedFiles: string[],
  diffStat: string,
  verification: { ok: boolean } | undefined,
  identity: ContributeIdentity,
  originRepo?: string
): string {
  const lines: string[] = [
    "## Changes",
    changedFiles.map((f) => `- \`${f}\``).join("\n"),
    "",
    "## Diff",
    "```",
    diffStat,
    "```",
    ""
  ];
  if (verification) {
    lines.push("## Verification", "All hooks passed.", "");
  }
  lines.push(
    "## Contributor",
    `- Identity: **${identity}**`,
    originRepo ? `- Fork: \`${originRepo}\`` : "",
    `- Generated by [UDD Kit](https://github.com/d-wwei/udd-kit)`
  );
  return lines.filter(Boolean).join("\n");
}
