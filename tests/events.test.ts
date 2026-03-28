import test from "node:test";
import assert from "node:assert/strict";
import { UddEventBus } from "../src/events.js";
import type { UpdateCheckResult } from "../src/types.js";

test("UddEventBus emits and receives typed events", () => {
  const bus = new UddEventBus();
  const received: UpdateCheckResult[] = [];
  bus.on("update:available", (data) => {
    received.push(data);
  });
  const update: UpdateCheckResult = {
    hasUpdate: true,
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    shouldNotify: true,
    highlights: ["fix: something"],
    checkedAt: new Date().toISOString(),
    ignored: false,
    message: "Update available"
  };
  bus.emit("update:available", update);
  assert.equal(received.length, 1);
  assert.equal(received[0].latestVersion, "1.1.0");
});

test("UddEventBus once fires only once", () => {
  const bus = new UddEventBus();
  let count = 0;
  bus.once("watch:tick", () => { count++; });
  bus.emit("watch:tick", { ts: "t1", cycle: 1 });
  bus.emit("watch:tick", { ts: "t2", cycle: 2 });
  assert.equal(count, 1);
});

test("UddEventBus off removes listener", () => {
  const bus = new UddEventBus();
  let count = 0;
  const listener = () => { count++; };
  bus.on("watch:tick", listener);
  bus.emit("watch:tick", { ts: "t1", cycle: 1 });
  bus.off("watch:tick", listener);
  bus.emit("watch:tick", { ts: "t2", cycle: 2 });
  assert.equal(count, 1);
});

test("UddEventBus removeAllListeners clears all", () => {
  const bus = new UddEventBus();
  let count = 0;
  bus.on("watch:tick", () => { count++; });
  bus.on("watch:tick", () => { count++; });
  bus.removeAllListeners("watch:tick");
  bus.emit("watch:tick", { ts: "t1", cycle: 1 });
  assert.equal(count, 0);
});
