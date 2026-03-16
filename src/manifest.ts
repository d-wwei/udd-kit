import { readFile } from "node:fs/promises";
import path from "node:path";

import type { UpgradeManifest } from "./types.js";

export async function loadManifest(cwd: string, fileName = "agent-upgrade.json"): Promise<UpgradeManifest> {
  const filePath = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as UpgradeManifest;
  validateManifest(parsed);
  return parsed;
}

function validateManifest(manifest: UpgradeManifest): void {
  if (!manifest.repo) throw new Error("Manifest requires repo.");
  if (!manifest.releaseChannel) throw new Error("Manifest requires releaseChannel.");
  if (!manifest.currentVersionSource?.type) {
    throw new Error("Manifest requires currentVersionSource.type.");
  }
}
