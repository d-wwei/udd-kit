#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { checkForUpdates, ignoreUpdateVersion } from "./check.js";
import { prepareContributionDraft } from "./contribution.js";
import { prepareIssueDraft } from "./issue.js";
import { loadManifest } from "./manifest.js";
import type { HostContext } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = parseFlags(args.slice(1));
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const manifest = await loadManifest(cwd, options.manifest ?? "udd.config.json").catch(async () => {
    return loadManifest(cwd, options.manifest ?? "agent-upgrade.json");
  });
  const ctx: HostContext = {
    cwd,
    appName: options.appName ?? path.basename(cwd),
    appVersion: options.appVersion,
    logs: collectMultiFlags(args.slice(1), "--log"),
    error: options.error ? { message: options.error } : undefined,
    confirm: async () => false
  };

  if (command === "check") {
    const result = await checkForUpdates(ctx, manifest);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "ignore") {
    if (!options.version) {
      throw new Error("--version is required for ignore");
    }
    await ignoreUpdateVersion(manifest, options.version);
    console.log(JSON.stringify({ ok: true, ignored: options.version, repo: manifest.repo }, null, 2));
    return;
  }

  if (command === "issue-draft") {
    const draft = await prepareIssueDraft(ctx, manifest, {
      expectedResult: options.expectedResult,
      reproductionSteps: options.repro ? options.repro.split("|||") : undefined,
      attemptedFixes: options.attemptedFixes ? options.attemptedFixes.split("|||") : undefined
    });
    console.log(JSON.stringify(draft, null, 2));
    if (options.out) {
      await writeFile(path.resolve(cwd, options.out), draft.preview, "utf8");
    }
    return;
  }

  if (command === "contribute-draft") {
    const draft = await prepareContributionDraft(ctx, manifest, {
      summary: options.summary,
      rootCause: options.rootCause,
      validation: options.validation ? options.validation.split("|||") : undefined
    });
    console.log(JSON.stringify(draft, null, 2));
    if (options.out) {
      await writeFile(path.resolve(cwd, options.out), draft.prBody, "utf8");
    }
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function parseFlags(args: string[]): Record<string, string> {
  const output: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) continue;
    output[token.slice(2)] = args[i + 1] ?? "";
    i += 1;
  }
  return output;
}

function collectMultiFlags(args: string[], flag: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag && args[i + 1]) {
      result.push(path.resolve(args[i + 1]));
      i += 1;
    }
  }
  return result;
}

function printUsage(): void {
  console.error([
    "Usage:",
    "  udd check --manifest ./udd.config.json",
    "  udd ignore --manifest ./udd.config.json --version 1.2.3",
    "  udd issue-draft --manifest ./udd.config.json --error \"Request failed\" --log ./app.log",
    "  udd contribute-draft --manifest ./udd.config.json --summary \"Fixed retry logic\"",
    "",
    "Compatibility aliases:",
    "  agent-upgrade check --manifest ./agent-upgrade.json"
  ].join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
