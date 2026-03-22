#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { checkForUpdates, ignoreUpdateVersion } from "./check.js";
import { prepareContributionDraft } from "./contribution.js";
import { prepareIssueDraft } from "./issue.js";
import { defineAdapter } from "./adapter.js";
import { loadManifest } from "./manifest.js";
import { createRuntime } from "./runtime.js";
import type { HostContext, UddDecision } from "./types.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = parseFlags(args.slice(1));
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const manifest = await loadManifest(cwd, options.manifest ?? "udd.config.json").catch(async () => {
    return loadManifest(cwd, options.manifest ?? "agent-upgrade.json");
  });
  const decision = options.decision as UddDecision | undefined;
  const manualSteps = collectMultiFlags(args.slice(1), "--manual-step");
  const ctx: HostContext = {
    cwd,
    appName: options.appName ?? path.basename(cwd),
    appVersion: options.appVersion,
    logs: collectMultiFlags(args.slice(1), "--log"),
    error: options.error ? { message: options.error } : undefined,
    confirm: async () => false
  };
  const adapter = defineAdapter({
    name: `${ctx.appName}-cli`,
    async getContext() {
      return ctx;
    },
    async decide(prompt) {
      if (decision) return decision;
      if (options.yes === "true") {
        return prompt.kind === "update" ? "update_once" : "repair_once";
      }
      return prompt.kind === "update" ? "skip_this_time" : "issue_only";
    },
    async getUpdateProviders() {
      if (!manualSteps.length) return [];
      return [{
        kind: "manual" as const,
        async describeManualSteps() {
          return manualSteps;
        }
      }];
    }
  });
  const runtime = await createRuntime({ cwd, manifest });

  if (command === "check") {
    const result = await checkForUpdates(ctx, manifest);
    printOutput(result, options);
    return;
  }

  if (command === "ignore") {
    if (!options.version) {
      throw new Error("--version is required for ignore");
    }
    await ignoreUpdateVersion(manifest, options.version);
    printOutput({ ok: true, ignored: options.version, repo: manifest.repo }, options);
    return;
  }

  if (command === "issue-draft") {
    const draft = await prepareIssueDraft(ctx, manifest, {
      expectedResult: options.expectedResult,
      reproductionSteps: options.repro ? options.repro.split("|||") : undefined,
      attemptedFixes: options.attemptedFixes ? options.attemptedFixes.split("|||") : undefined
    });
    printOutput(draft, options);
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
    printOutput(draft, options);
    if (options.out) {
      await writeFile(path.resolve(cwd, options.out), draft.prBody, "utf8");
    }
    return;
  }

  if (command === "analyze") {
    const diagnosis = await runtime.analyze(adapter, {
      error: ctx.error,
      appVersion: ctx.appVersion
    });
    printOutput(diagnosis, options);
    return;
  }

  if (command === "heal") {
    const result = await runtime.heal(adapter, {
      error: ctx.error,
      appVersion: ctx.appVersion,
      auth: options["github-token"] ? { token: options["github-token"] } : undefined,
      submitIssueOnEscalation: options["submit-issue"] === "true",
      createPr: options["no-pr"] === "true" ? false : true
    });
    printOutput(result, options);
    return;
  }

  if (command === "state") {
    const state = await runtime.getState(adapter);
    printOutput(state, options);
    return;
  }

  if (command === "audit") {
    const limit = options.limit ? Number(options.limit) : 20;
    const audit = await runtime.getAudit(adapter, Number.isFinite(limit) ? limit : 20);
    printOutput(audit, options);
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
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      output[token.slice(2)] = "true";
      continue;
    }
    output[token.slice(2)] = next;
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
    "  udd analyze --manifest ./udd.config.json --error \"Request failed\"",
    "  udd heal --manifest ./udd.config.json --error \"Request failed\" --decision repair_once",
    "  udd state --manifest ./udd.config.json",
    "  udd audit --manifest ./udd.config.json --limit 20",
    "  udd issue-draft --manifest ./udd.config.json --error \"Request failed\" --log ./app.log",
    "  udd contribute-draft --manifest ./udd.config.json --summary \"Fixed retry logic\"",
    "",
    "Compatibility aliases:",
    "  agent-upgrade check --manifest ./agent-upgrade.json"
  ].join("\n"));
}

function printOutput(value: unknown, options: Record<string, string>): void {
  if (options.json === "true") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
