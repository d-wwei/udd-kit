import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execCommand } from "./exec.js";
import type { UddAdapter, UpgradeManifest } from "./types.js";

export type WorkspaceHandle = {
  cwd: string;
  mode: "git_worktree" | "inline";
  cleanup: () => Promise<void>;
};

export async function createWorkspace(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  cwd: string
): Promise<WorkspaceHandle> {
  const mode = manifest.selfHealing?.workspaceMode ?? "git_worktree";
  if (mode === "inline") {
    return {
      cwd,
      mode: "inline",
      cleanup: async () => {}
    };
  }

  const worktreeDir = await mkdtemp(path.join(os.tmpdir(), "udd-heal-"));
  try {
    await execCommand(["git", "worktree", "add", worktreeDir, "HEAD"], cwd, adapter);
  } catch (error) {
    await rm(worktreeDir, { recursive: true, force: true });
    throw error;
  }

  return {
    cwd: worktreeDir,
    mode: "git_worktree",
    cleanup: async () => {
      try {
        await execCommand(["git", "worktree", "remove", "--force", worktreeDir], cwd, adapter);
      } catch {
        await rm(worktreeDir, { recursive: true, force: true });
      }
    }
  };
}
