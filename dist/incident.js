import { checkForUpdates } from "./check.js";
import { resolveAdapterContext } from "./adapter.js";
import { execCommand } from "./exec.js";
async function gitText(cmd, cwd, adapter) {
    try {
        return await execCommand(cmd, cwd, adapter);
    }
    catch {
        return "";
    }
}
export async function collectIncidentContext(adapter, manifest, overrides = {}) {
    const base = await resolveAdapterContext(adapter, overrides);
    const branch = await gitText(["git", "rev-parse", "--abbrev-ref", "HEAD"], base.cwd, adapter);
    const head = await gitText(["git", "rev-parse", "HEAD"], base.cwd, adapter);
    const changedFiles = await gitText(["git", "status", "--short"], base.cwd, adapter);
    const update = base.upstream?.latestVersion != null || base.upstream?.hasUpdate != null
        ? undefined
        : await checkForUpdates(base, manifest).catch(() => undefined);
    return {
        ...base,
        git: {
            branch: branch || undefined,
            head: head || undefined,
            changedFiles: changedFiles
                ? changedFiles
                    .split(/\r?\n/)
                    .map((line) => line.trim().slice(3))
                    .filter(Boolean)
                : []
        },
        upstream: {
            currentVersion: base.upstream?.currentVersion ?? update?.currentVersion ?? base.appVersion,
            latestVersion: base.upstream?.latestVersion ?? update?.latestVersion,
            hasUpdate: base.upstream?.hasUpdate ?? update?.hasUpdate,
            highlights: base.upstream?.highlights ?? update?.highlights ?? [],
            releaseUrl: base.upstream?.releaseUrl ?? update?.releaseUrl
        }
    };
}
