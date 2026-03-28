import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createQuickAdapter, initUdd } from "../src/quick.js";
import type { UpgradeManifest } from "../src/types.js";

test("createQuickAdapter returns a working adapter with defaults", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-quick-"));
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "test-app", version: "2.3.4" }), "utf8");
  const adapter = createQuickAdapter({ cwd });
  const ctx = await adapter.getContext();
  assert.equal(ctx.cwd, cwd);
  assert.equal(ctx.appVersion, "2.3.4");
  assert.ok(ctx.appName);
  assert.ok(typeof ctx.confirm === "function");
  // default confirm returns false (autoApprove=false)
  const confirmed = await ctx.confirm({ kind: "repair", title: "test", summary: "test" });
  assert.equal(confirmed, false);
  await rm(cwd, { recursive: true, force: true });
});

test("createQuickAdapter with autoApprove=true", async () => {
  const adapter = createQuickAdapter({ name: "my-skill", cwd: "/tmp", autoApprove: true });
  const ctx = await adapter.getContext();
  const confirmed = await ctx.confirm({ kind: "repair", title: "test", summary: "test" });
  assert.equal(confirmed, true);
});

test("initUdd returns runtime and adapter pair", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-init-"));
  const manifest: UpgradeManifest = {
    repo: "test/repo",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" }
  };
  const { runtime, adapter } = await initUdd({ cwd, manifest, name: "test" });
  assert.ok(runtime);
  assert.ok(adapter);
  assert.equal(runtime.manifest.repo, "test/repo");
  assert.ok(runtime.events);
  await rm(cwd, { recursive: true, force: true });
});
