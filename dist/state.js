import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
function defaultStatePath(cwd) {
    return path.join(cwd, ".udd", "state.json");
}
export async function readPersistentState(adapter, manifest, cwd) {
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
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export async function writePersistentState(adapter, manifest, cwd, state) {
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
