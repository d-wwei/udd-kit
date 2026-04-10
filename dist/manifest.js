import { readFile } from "node:fs/promises";
import path from "node:path";
export async function loadManifest(cwd, fileName = "agent-upgrade.json") {
    const filePath = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    validateManifest(parsed);
    return parsed;
}
function validateManifest(manifest) {
    if (!manifest.repo)
        throw new Error("Manifest requires repo.");
    if (!manifest.releaseChannel)
        throw new Error("Manifest requires releaseChannel.");
    if (!manifest.currentVersionSource?.type) {
        throw new Error("Manifest requires currentVersionSource.type.");
    }
}
