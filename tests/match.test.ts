import test from "node:test";
import assert from "node:assert/strict";
import { matchChangelogToError } from "../src/match.js";

test("returns high confidence when error code matches changelog line", () => {
  const result = matchChangelogToError(
    { message: "ENOENT: no such file or directory, open config.json" },
    ["fix: resolve ENOENT when config.json is missing on first run"]
  );
  assert.ok(result);
  assert.equal(result.confidence, "high");
  assert.ok(result.score >= 0.7);
  assert.ok(result.matchedHighlights.length > 0);
});

test("returns match when significant token overlap exists", () => {
  const result = matchChangelogToError(
    { message: "failed to parse authentication token from header" },
    [
      "feat: add dark mode support",
      "fix: authentication token parsing now handles edge cases",
      "docs: update README"
    ]
  );
  assert.ok(result);
  assert.ok(result.score >= 0.3);
  assert.ok(result.matchedHighlights.some((h) => h.includes("authentication")));
});

test("returns undefined when no meaningful overlap", () => {
  const result = matchChangelogToError(
    { message: "network timeout connecting to database" },
    [
      "feat: add new color theme",
      "chore: update CI pipeline",
      "docs: fix typo in README"
    ]
  );
  assert.equal(result, undefined);
});

test("returns undefined for empty highlights", () => {
  const result = matchChangelogToError(
    { message: "something went wrong" },
    []
  );
  assert.equal(result, undefined);
});

test("returns undefined for empty error message", () => {
  const result = matchChangelogToError(
    { message: "" },
    ["fix: some issue"]
  );
  assert.equal(result, undefined);
});

test("error code boost produces match that would otherwise be below threshold", () => {
  const result = matchChangelogToError(
    { message: "TypeError in module handler" },
    ["fix: TypeError thrown during initialization"]
  );
  assert.ok(result);
  assert.ok(result.score > 0.3);
});

test("multiple highlights are returned when several match", () => {
  const result = matchChangelogToError(
    { message: "CSS selector failed to match navigation element" },
    [
      "fix: CSS selector matching for navigation elements",
      "fix: navigation element detection on updated pages",
      "feat: add new export format"
    ]
  );
  assert.ok(result);
  assert.ok(result.matchedHighlights.length >= 2);
});

test("recommendation text varies by confidence level", () => {
  const high = matchChangelogToError(
    { message: "CORS error when fetching API endpoint", code: "CORS" },
    ["fix: CORS error when fetching API endpoint resolved"]
  );
  assert.ok(high);
  assert.ok(high.recommendation.includes("likely fixes"));

  const low = matchChangelogToError(
    { message: "unexpected response from server during batch processing" },
    ["fix: batch processing handles unexpected server responses"]
  );
  if (low && low.confidence === "low") {
    assert.ok(low.recommendation.includes("potentially related"));
  }
});
