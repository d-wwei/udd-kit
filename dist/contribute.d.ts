import type { ContributeIdentity, ContributeOptions, ContributeResult, HostContext, UddAdapter, UpgradeManifest } from "./types.js";
/**
 * Detect whether the current user is the repo owner or an external contributor.
 * Compares the git remote origin URL against the upstream/manifest repo.
 *
 * - owner: origin points to the same repo as upstream (direct push allowed)
 * - external: origin is a fork (should create PR against upstream)
 * - unknown: cannot determine (e.g. no remote, non-GitHub)
 */
export declare function detectIdentity(cwd: string, manifest: UpgradeManifest, remoteName?: string, exec?: ContributeOptions["exec"]): Promise<{
    identity: ContributeIdentity;
    originRepo?: string;
    upstreamRepo: string;
}>;
/**
 * Main contribute flow:
 * 1. Detect local changes
 * 2. Detect identity (owner vs external) and resolve strategy
 * 3. Run verification hooks (if configured)
 * 4. Commit and push (direct or PR to upstream)
 * 5. Write audit record
 */
export declare function contribute(adapter: UddAdapter, manifest: UpgradeManifest, ctx: HostContext, options?: ContributeOptions): Promise<ContributeResult>;
