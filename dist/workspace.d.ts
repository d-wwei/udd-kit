import type { UddAdapter, UpgradeManifest } from "./types.js";
export type WorkspaceHandle = {
    cwd: string;
    mode: "git_worktree" | "inline";
    cleanup: () => Promise<void>;
};
export declare function createWorkspace(adapter: UddAdapter, manifest: UpgradeManifest, cwd: string): Promise<WorkspaceHandle>;
