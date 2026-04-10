import type { AuditRecord, HostContext, UddAdapter, UpgradeManifest } from "./types.js";
export declare function writeAuditRecord(adapter: UddAdapter, manifest: UpgradeManifest, ctx: HostContext, input: Omit<AuditRecord, "id" | "ts" | "appName">): Promise<AuditRecord>;
export declare function readAuditRecords(manifest: UpgradeManifest, cwd: string): Promise<AuditRecord[]>;
