import { readFileSync } from "node:fs";
import path from "node:path";

import { defineAdapter } from "./adapter.js";
import { createRuntime, UddRuntime } from "./runtime.js";
import type { ConfirmationPrompt, HostError, UddAdapter, UpgradeManifest } from "./types.js";

export type QuickAdapterOptions = {
  name?: string;
  cwd?: string;
  appVersion?: string;
  logs?: string[];
  autoApprove?: boolean;
  onConfirm?: (prompt: ConfirmationPrompt) => Promise<boolean>;
  error?: HostError;
};

function detectVersion(cwd: string): string | undefined {
  try {
    const raw = readFileSync(path.join(cwd, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version;
  } catch {
    return undefined;
  }
}

export function createQuickAdapter(options: QuickAdapterOptions = {}): UddAdapter {
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

export type InitUddOptions = QuickAdapterOptions & {
  manifestFile?: string;
  manifest?: UpgradeManifest;
};

export async function initUdd(options: InitUddOptions = {}): Promise<{
  runtime: UddRuntime;
  adapter: UddAdapter;
}> {
  const cwd = options.cwd ?? process.cwd();
  const adapter = createQuickAdapter(options);
  const runtime = await createRuntime({
    cwd,
    manifestFile: options.manifestFile,
    manifest: options.manifest
  });
  return { runtime, adapter };
}
