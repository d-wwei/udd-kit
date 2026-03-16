import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { defineAdapter } from "../src/adapter.js";
import { createRuntime } from "../src/runtime.js";

test("runtime uses adapter and udd.config.json by default", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "udd-runtime-"));
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
  await writeFile(path.join(cwd, "udd.config.json"), JSON.stringify({
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "package.json", path: "./package.json" }
  }), "utf8");

  const runtime = await createRuntime({ cwd });
  const adapter = defineAdapter({
    name: "demo",
    async getContext() {
      return {
        cwd,
        appName: "demo",
        confirm: async () => true
      };
    }
  });

  const result = await runtime.check(adapter, {
    appVersion: "1.0.0"
  });
  assert.equal(result.currentVersion, "1.0.0");
  await rm(cwd, { recursive: true, force: true });
});
