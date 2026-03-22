import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AuditRecord, HostContext, UddAdapter, UpgradeManifest } from "./types.js";

function defaultAuditPath(cwd: string): string {
  return path.join(cwd, ".udd", "audit.jsonl");
}

export async function writeAuditRecord(
  adapter: UddAdapter,
  manifest: UpgradeManifest,
  ctx: HostContext,
  input: Omit<AuditRecord, "id" | "ts" | "appName">
): Promise<AuditRecord> {
  const record: AuditRecord = {
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

export async function readAuditRecords(
  manifest: UpgradeManifest,
  cwd: string
): Promise<AuditRecord[]> {
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
      .map((line) => JSON.parse(line) as AuditRecord);
  } catch {
    return [];
  }
}
