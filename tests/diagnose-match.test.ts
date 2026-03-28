import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseIncident } from "../src/diagnose.js";
import { defineAdapter } from "../src/adapter.js";
import type { HostContext, UpgradeManifest } from "../src/types.js";

const baseManifest: UpgradeManifest = {
  repo: "test/repo",
  releaseChannel: "releases",
  currentVersionSource: { type: "literal", value: "1.0.0" },
  selfHealing: {
    enabled: true,
    strategyOrder: ["upstream_update", "agent_patch", "issue_only"]
  }
};

test("diagnosis upgrades to upstream_update when highlights match error", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "CORS error when fetching API endpoint" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      highlights: [
        "fix: CORS error when fetching API endpoint resolved",
        "feat: add new export format"
      ]
    },
    confirm: async () => true
  };
  const diagnosis = await diagnoseIncident(ctx, baseManifest);
  assert.equal(diagnosis.kind, "upstream_update");
  assert.ok(diagnosis.confidence >= 0.8);
  assert.ok(diagnosis.upstreamFixMatch);
  assert.ok(diagnosis.upstreamFixMatch.confidence === "high" || diagnosis.upstreamFixMatch.confidence === "medium");
});

test("diagnosis falls back to regex when highlights don't match", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "dependency version mismatch" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      highlights: [
        "feat: add new feature",
        "chore: update dependencies"
      ]
    },
    confirm: async () => true
  };
  const diagnosis = await diagnoseIncident(ctx, baseManifest);
  assert.equal(diagnosis.kind, "upstream_update");
  assert.equal(diagnosis.confidence, 0.8);
});

test("diagnosis includes upstreamFixMatch even when not primary signal", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "config env missing required field" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      highlights: [
        "fix: config validation now handles missing fields"
      ]
    },
    confirm: async () => true
  };
  const diagnosis = await diagnoseIncident(ctx, baseManifest);
  assert.ok(diagnosis.upstreamFixMatch);
});

test("diagnosis works without highlights (backward compat)", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "runtime failure" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.0.0",
      hasUpdate: false
    },
    confirm: async () => true
  };
  const diagnosis = await diagnoseIncident(ctx, baseManifest);
  assert.equal(diagnosis.kind, "code_bug");
  assert.equal(diagnosis.upstreamFixMatch, undefined);
});

test("diagnosis works without upstream at all", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "something broke" },
    confirm: async () => true
  };
  const diagnosis = await diagnoseIncident(ctx, baseManifest);
  assert.equal(diagnosis.kind, "code_bug");
  assert.equal(diagnosis.upstreamFixMatch, undefined);
});

test("diagnosis prefers adapter semantic matching over text fallback", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "widget rendering fails on Safari" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      highlights: [
        "fix: Safari WebKit compatibility for widget rendering"
      ]
    },
    confirm: async () => true
  };
  const adapter = defineAdapter({
    name: "test-agent",
    async getContext() { return ctx; },
    async matchUpstreamFix(request) {
      // Simulate LLM semantic match: understands Safari + widget rendering = same issue
      return {
        confidence: "high",
        score: 0.95,
        matchedHighlights: request.highlights,
        recommendation: `LLM match: upstream ${request.latestVersion} fixes Safari widget rendering.`
      };
    }
  });
  const diagnosis = await diagnoseIncident(ctx, baseManifest, adapter);
  assert.equal(diagnosis.kind, "upstream_update");
  assert.equal(diagnosis.confidence, 0.9);
  assert.ok(diagnosis.upstreamFixMatch);
  assert.equal(diagnosis.upstreamFixMatch.score, 0.95);
  assert.ok(diagnosis.upstreamFixMatch.recommendation.includes("LLM match"));
});

test("diagnosis falls back to text matching when adapter match throws", async () => {
  const ctx: HostContext = {
    cwd: "/tmp/test",
    appName: "demo",
    error: { message: "CORS error when fetching API endpoint" },
    upstream: {
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      hasUpdate: true,
      highlights: [
        "fix: CORS error when fetching API endpoint resolved"
      ]
    },
    confirm: async () => true
  };
  const adapter = defineAdapter({
    name: "broken-agent",
    async getContext() { return ctx; },
    async matchUpstreamFix() {
      throw new Error("LLM unavailable");
    }
  });
  const diagnosis = await diagnoseIncident(ctx, baseManifest, adapter);
  // Should still get a match from text fallback
  assert.equal(diagnosis.kind, "upstream_update");
  assert.ok(diagnosis.upstreamFixMatch);
});
