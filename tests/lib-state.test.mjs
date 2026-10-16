import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, utimesSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readGlobalState, writeGlobalState, isPaused,
  readSession, writeSession, sessionPath, pruneSessions,
} from "../scripts/lib/state.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-state-"));

test("global state defaults and round-trips", () => {
  const dir = tmp();
  assert.deepEqual(readGlobalState(dir), { onboarded: false });
  writeGlobalState(dir, { onboarded: true, pausedUntil: -1 });
  assert.deepEqual(readGlobalState(dir), { onboarded: true, pausedUntil: -1 });
});

test("isPaused handles indefinite, future, expired, and unset", () => {
  const now = 1_000_000;
  assert.equal(isPaused({ pausedUntil: -1 }, now), true);
  assert.equal(isPaused({ pausedUntil: now + 1 }, now), true);
  assert.equal(isPaused({ pausedUntil: now - 1 }, now), false);
  assert.equal(isPaused({}, now), false);
  assert.equal(isPaused({ pausedUntil: "soon" }, now), false);
});

test("session state is isolated per id and ids are sanitised", () => {
  const dir = tmp();
  assert.deepEqual(readSession(dir, "a"), { promptCount: 0, lastBreakAt: 0, startedAt: 0 });
  writeSession(dir, "a", { promptCount: 3, lastBreakAt: 5 });
  writeSession(dir, "b", { promptCount: 1, lastBreakAt: 0 });
  assert.equal(readSession(dir, "a").promptCount, 3);
  assert.equal(readSession(dir, "b").promptCount, 1);
  assert.ok(sessionPath(dir, "../evil/../x").endsWith(join("sessions", "___evil____x.json")));
  assert.ok(sessionPath(dir, undefined).endsWith(join("sessions", "default.json")));
});

test("pruneSessions removes only files older than maxAge", () => {
  const dir = tmp();
  writeSession(dir, "old", { promptCount: 1, lastBreakAt: 0 });
  writeSession(dir, "new", { promptCount: 1, lastBreakAt: 0 });
  const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  utimesSync(sessionPath(dir, "old"), old, old);
  const removed = pruneSessions(dir, 7 * 24 * 3600 * 1000);
  assert.equal(removed, 1);
  assert.equal(existsSync(sessionPath(dir, "old")), false);
  assert.equal(existsSync(sessionPath(dir, "new")), true);
  assert.equal(pruneSessions(join(dir, "does-not-exist")), 0);
  assert.deepEqual(readdirSync(join(dir, "sessions")), ["new.json"]);
});
