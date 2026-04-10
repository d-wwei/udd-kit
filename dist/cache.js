import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export async function readCache(cachePath) {
    try {
        const raw = await readFile(cachePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export async function writeCache(cachePath, state) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(state, null, 2), "utf8");
}
export async function rememberUpdateCheck(cachePath, repo, payload) {
    const state = await readCache(cachePath);
    state.updates ??= {};
    state.updates[repo] = payload;
    await writeCache(cachePath, state);
}
export async function ignoreVersion(cachePath, repo, version) {
    const state = await readCache(cachePath);
    state.updates ??= {};
    const entry = state.updates[repo] ?? { lastCheckedAt: new Date(0).toISOString(), ignoredVersions: [] };
    const ignored = new Set(entry.ignoredVersions ?? []);
    ignored.add(version);
    state.updates[repo] = {
        ...entry,
        ignoredVersions: [...ignored]
    };
    await writeCache(cachePath, state);
}
