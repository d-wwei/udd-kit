import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
function defaultAuditPath(cwd) {
    return path.join(cwd, ".udd", "audit.jsonl");
}
export async function writeAuditRecord(adapter, manifest, ctx, input) {
    const record = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        appName: ctx.appName,
        ...input
    };
    if (adapter.writeAudit) {
        await adapter.writeAudit(record);
        return record;
    }
    const filePath = manifest.audit?.path
        ? path.isAbsolute(manifest.audit.path)
            ? manifest.audit.path
            : path.join(ctx.cwd, manifest.audit.path)
        : defaultAuditPath(ctx.cwd);
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, JSON.stringify(record) + "\n", "utf8");
    return record;
}
export async function readAuditRecords(manifest, cwd) {
    const filePath = manifest.audit?.path
        ? path.isAbsolute(manifest.audit.path)
            ? manifest.audit.path
            : path.join(cwd, manifest.audit.path)
        : defaultAuditPath(cwd);
    try {
        const raw = await readFile(filePath, "utf8");
        return raw
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
