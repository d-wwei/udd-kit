import { readFileSync } from "node:fs";
import path from "node:path";
import { defineAdapter } from "./adapter.js";
import { createRuntime } from "./runtime.js";
function detectVersion(cwd) {
    try {
        const raw = readFileSync(path.join(cwd, "package.json"), "utf8");
        const parsed = JSON.parse(raw);
        return parsed.version;
    }
    catch {
        return undefined;
    }
}
export function createQuickAdapter(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const name = options.name ?? path.basename(cwd);
    const appVersion = options.appVersion ?? detectVersion(cwd);
    const autoApprove = options.autoApprove ?? false;
    const onConfirm = options.onConfirm ?? (async () => autoApprove);
    return defineAdapter({
        name,
        async getContext(overrides) {
            return {
                cwd,
                appName: name,
                appVersion,
                logs: options.logs,
                error: overrides?.error ?? options.error,
                confirm: overrides?.confirm ?? onConfirm
            };
        }
    });
}
export async function initUdd(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const adapter = createQuickAdapter(options);
    const runtime = await createRuntime({
        cwd,
        manifestFile: options.manifestFile,
        manifest: options.manifest
    });
    return { runtime, adapter };
}
