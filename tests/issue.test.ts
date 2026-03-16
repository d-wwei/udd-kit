import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prepareIssueDraft } from "../src/issue.js";
import type { HostContext, UpgradeManifest } from "../src/types.js";

test("prepareIssueDraft redacts tokens and absolute paths", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agent-upgrade-issue-"));
  const logPath = path.join(cwd, "latest.log");
  await writeFile(logPath, `token=ghp_secret123\ncwd=${cwd}\nmessage=boom`, "utf8");
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "literal", value: "1.0.0" },
    privacyRules: {
      redactPatterns: ["secret123"]
    }
  };
  const ctx: HostContext = {
    cwd,
    appName: "example",
    logs: [logPath],
    error: { message: `Failure at ${cwd} with ghp_secret123` },
    confirm: async () => true
  };

  const draft = await prepareIssueDraft(ctx, manifest);
  assert.match(draft.body, /\[REDACTED\]/);
  assert.doesNotMatch(draft.body, /ghp_secret123/);
  assert.doesNotMatch(draft.body, new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await rm(cwd, { recursive: true, force: true });
});
