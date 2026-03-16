import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { prepareContributionDraft } from "../src/contribution.js";
import type { HostContext, UpgradeManifest } from "../src/types.js";

const execFileAsync = promisify(execFile);

test("prepareContributionDraft blocks protected paths", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agent-upgrade-contrib-"));
  await execFileAsync("git", ["init"], { cwd });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd });
  await execFileAsync("git", ["config", "user.name", "Test"], { cwd });
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
  await execFileAsync("git", ["add", "."], { cwd });
  await execFileAsync("git", ["commit", "-m", "init"], { cwd });
  await writeFile(path.join(cwd, ".env"), "SECRET=yes", "utf8");

  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" },
    contributionPolicy: {
      enabled: true,
      protectedPaths: [".env"]
    }
  };
  const ctx: HostContext = {
    cwd,
    appName: "example",
    confirm: async () => true
  };

  const draft = await prepareContributionDraft(ctx, manifest, { summary: "fixed env handling" });
  assert.equal(draft.allowed, false);
  assert.match(draft.blockedReasons.join("\n"), /Protected paths/);
  await rm(cwd, { recursive: true, force: true });
});
