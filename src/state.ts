import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { UddAdapter, UddPersistentState, UpgradeManifest } from "./types.js";

function defaultStatePath(cwd: string): string {
  return path.join(cwd, ".udd", "state.json");
}

export async function readPersistentState(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  cwd: string
): Promise<UddPersistentState> {
  if (adapter.readState) {
    return (await adapter.readState()) ?? {};
  }
  const filePath = manifest.state?.path
    ? path.isAbsolute(manifest.state.path)
      ? manifest.state.path
      : path.join(cwd, manifest.state.path)
    : defaultStatePath(cwd);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as UddPersistentState;
  } catch {
    return {};
  }
}

export async function writePersistentState(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  cwd: string,
  state: UddPersistentState
): Promise<void> {
  if (adapter.writeState) {
    await adapter.writeState(state);
    return;
  }
  const filePath = manifest.state?.path
    ? path.isAbsolute(manifest.state.path)
      ? manifest.state.path
      : path.join(cwd, manifest.state.path)
    : defaultStatePath(cwd);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}
