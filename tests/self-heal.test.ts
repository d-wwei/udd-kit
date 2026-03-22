import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { defineAdapter } from "../src/adapter.js";
import { createRuntime } from "../src/runtime.js";
import type { UpgradeManifest } from "../src/types.js";

const execFileAsync = promisify(execFile);

async function initRepo(cwd: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd });
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");
  await writeFile(path.join(cwd, "README.md"), "# demo\n", "utf8");
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd });
}

test("heal repairs locally with agent, verifies, and records state/audit", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-heal-success-"));
  await initRepo(cwd);
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" },
    contributionPolicy: { enabled: true },
    selfHealing: {
      enabled: true,
      strategyOrder: ["agent_patch", "issue_only"],
      workspaceMode: "inline"
    },
    hooks: {
      verification: [{ name: "fixed-file", command: "test -f fixed.txt" }]
    },
    state: { path: ".udd/state.json" },
    audit: { path: ".udd/audit.jsonl" }
  };
  const runtime = await createRuntime({ cwd, manifest });
  const adapter = defineAdapter({
    name: "demo",
    async getContext() {
      return {
        cwd,
        appName: "demo",
        error: { message: "runtime boom" },
        confirm: async () => true
      };
    },
    decide: async () => "repair_once",
    async invokeRepairAgent(request) {
      await writeFile(path.join(request.workspacePath, "fixed.txt"), "ok\n", "utf8");
      return {
        ok: true,
        summary: "patched the workflow",
        changedFiles: ["fixed.txt"]
      };
    }
  });

  const result = await runtime.heal(adapter);
  assert.equal(result.status, "repaired");
  assert.match(result.contribution.prTitle, /fix:/);
  assert.deepEqual(result.contribution.changedFiles, ["fixed.txt"]);

  const state = await runtime.getState(adapter);
  assert.equal(state.lastHeal?.status, "repaired");

  const audit = await runtime.getAudit(adapter, 20);
  assert.ok(audit.some((record) => record.step === "verification_completed" && record.status === "ok"));
  assert.ok(audit.some((record) => record.step === "pr_created"));

  const persisted = JSON.parse(await readFile(path.join(cwd, ".udd", "state.json"), "utf8")) as {
    lastHeal?: { status?: string };
  };
  assert.equal(persisted.lastHeal?.status, "repaired");

  await rm(cwd, { recursive: true, force: true });
});

test("heal falls back to manual update guidance when no executable update provider exists", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-heal-manual-update-"));
  await initRepo(cwd);
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" },
    selfHealing: {
      enabled: true,
      strategyOrder: ["upstream_update", "issue_only"],
      updateStrategyOrder: ["manual"],
      workspaceMode: "inline"
    }
  };
  const runtime = await createRuntime({ cwd, manifest });
  const adapter = defineAdapter({
    name: "demo",
    async getContext() {
      return {
        cwd,
        appName: "demo",
        error: { message: "dependency mismatch in host integration" },
        upstream: {
          currentVersion: "1.0.0",
          latestVersion: "1.1.0",
          hasUpdate: true
        },
        confirm: async () => true
      };
    },
    decide: async () => "update_once",
    async getUpdateProviders() {
      return [
        {
          kind: "manual" as const,
          async describeManualSteps() {
            return ["git fetch upstream", "install the new version", "rerun verification"];
          }
        }
      ];
    }
  });

  const result = await runtime.heal(adapter);
  assert.equal(result.status, "skipped");
  assert.equal(result.strategy, "upstream_update");
  assert.deepEqual(result.manualUpdateSteps, [
    "git fetch upstream",
    "install the new version",
    "rerun verification"
  ]);

  await rm(cwd, { recursive: true, force: true });
});

test("heal escalates to issue and records rollback when verification fails in isolated workspace", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-heal-fail-"));
  await initRepo(cwd);
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" },
    contributionPolicy: { enabled: true },
    selfHealing: {
      enabled: true,
      strategyOrder: ["agent_patch", "issue_only"],
      workspaceMode: "git_worktree",
      fallbackToIssue: true
    },
    hooks: {
      verification: [{ name: "always-fail", command: "false" }]
    },
    audit: { path: ".udd/audit.jsonl" }
  };
  const runtime = await createRuntime({ cwd, manifest });
  const adapter = defineAdapter({
    name: "demo",
    async getContext() {
      return {
        cwd,
        appName: "demo",
        error: { message: "test failure" },
        confirm: async () => true
      };
    },
    decide: async () => "repair_once",
    async invokeRepairAgent(request) {
      await writeFile(path.join(request.workspacePath, "fixed.txt"), "ok\n", "utf8");
      return {
        ok: true,
        summary: "patched test",
        changedFiles: ["fixed.txt"]
      };
    }
  });

  const result = await runtime.heal(adapter);
  assert.equal(result.status, "escalated");
  assert.match(result.issueDraft.title, /\[Bug\]/);

  const audit = await runtime.getAudit(adapter, 20);
  assert.ok(audit.some((record) => record.step === "rollback_completed" && record.status === "ok"));

  await rm(cwd, { recursive: true, force: true });
});
