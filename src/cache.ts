import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CacheState = {
  updates?: Record<string, { lastCheckedAt: string; lastVersion?: string; ignoredVersions?: string[] }>;
};

export async function readCache(cachePath: string): Promise<CacheState> {
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw) as CacheState;
  } catch {
    return {};
  }
}

export async function writeCache(cachePath: string, state: CacheState): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(state, null, 2), "utf8");
}

export async function rememberUpdateCheck(
  cachePath: string,
  repo: string,
  payload: { lastCheckedAt: string; lastVersion?: string; ignoredVersions?: string[] }
): Promise<void> {
  const state = await readCache(cachePath);
  state.updates ??= {};
  state.updates[repo] = payload;
  await writeCache(cachePath, state);
}

export async function ignoreVersion(cachePath: string, repo: string, version: string): Promise<void> {
  const state = await readCache(cachePath);
  state.updates ??= {};
  const entry = state.updates[repo] ?? { lastCheckedAt: new Date(0).toISOString(), ignoredVersions: [] as string[] };
  const ignored = new Set(entry.ignoredVersions ?? []);
  ignored.add(version);
  state.updates[repo] = {
    ...entry,
    ignoredVersions: [...ignored]
  };
  await writeCache(cachePath, state);
}
