import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkForUpdates, ignoreUpdateVersion } from "../src/check.js";
import type { HostContext, UpgradeManifest } from "../src/types.js";

test("checkForUpdates detects latest release and formats highlights", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agent-upgrade-check-"));
  const cachePath = path.join(cwd, "cache.json");
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "package.json", path: "./package.json" },
    changelogSource: { type: "release_notes" }
  };
  const ctx: HostContext = {
    cwd,
    appName: "example",
    confirm: async () => true
  };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/releases/latest")) {
      return new Response(JSON.stringify({
        tag_name: "v1.2.0",
        html_url: "https://github.com/eli/example/releases/tag/v1.2.0",
        body: "Improved retries\nFixed logging"
      }), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const result = await checkForUpdates(ctx, manifest, { fetchImpl, cachePath, cacheTtlMs: 0 });
  assert.equal(result.hasUpdate, true);
  assert.equal(result.latestVersion, "1.2.0");
  assert.match(result.message, /Improved retries/);
  await rm(cwd, { recursive: true, force: true });
});

test("checkForUpdates handles tag-only repositories", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agent-upgrade-tags-"));
  const cachePath = path.join(cwd, "cache.json");
  await writeFile(path.join(cwd, "VERSION"), "0.5.0", "utf8");
  const manifest: UpgradeManifest = {
    repo: "eli/tagged",
    releaseChannel: "tags",
    currentVersionSource: { type: "file", path: "./VERSION" }
  };
  const ctx: HostContext = { cwd, appName: "tagged", confirm: async () => true };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("/tags?")) {
      return new Response(JSON.stringify([{ name: "v0.6.0" }]), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const result = await checkForUpdates(ctx, manifest, { fetchImpl, cachePath });
  assert.equal(result.hasUpdate, true);
  assert.equal(result.latestVersion, "0.6.0");
  await rm(cwd, { recursive: true, force: true });
});

test("ignoreUpdateVersion suppresses future notifications for that version", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "agent-upgrade-ignore-"));
  const cachePath = path.join(cwd, "cache.json");
  await writeFile(path.join(cwd, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
  const manifest: UpgradeManifest = {
    repo: "eli/example",
    releaseChannel: "releases",
    currentVersionSource: { type: "package.json", path: "./package.json" }
  };
  const ctx: HostContext = { cwd, appName: "example", confirm: async () => true };
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/releases/latest")) {
      return new Response(JSON.stringify({ tag_name: "v1.2.3" }), { status: 200 });
    }
    throw new Error(`unexpected url ${url}`);
  };

  await ignoreUpdateVersion(manifest, "1.2.3", { cachePath });
  const result = await checkForUpdates(ctx, manifest, { fetchImpl, cachePath });
  assert.equal(result.hasUpdate, true);
  assert.equal(result.shouldNotify, false);
  assert.equal(result.ignored, true);
  await rm(cwd, { recursive: true, force: true });
});
