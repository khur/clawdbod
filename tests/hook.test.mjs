import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "stop-fitness-check.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-hook-"));

function fire(dir, input, env = {}) {
  const r = spawnSync("node", [HOOK], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf-8",
    env: { ...process.env, CLAWDBOD_DATA_DIR: dir, CLAWDBOD_PROMPTS: "2", CLAWDBOD_MINUTES: "1", ...env },
  });
  assert.equal(r.status, 0, `hook exited ${r.status}: ${r.stderr}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

const session = (id) => join("sessions", `${id}.json`);
const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));

test("first run with no config emits setup once, then never again", () => {
  const dir = tmp();
  const first = fire(dir, { session_id: "s1" });
  assert.equal(first.decision, "block");
  assert.match(first.reason, /CLAWDBOD SETUP/);
  assert.equal(readJson(join(dir, "state.json")).onboarded, true);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s2" }), null);
});

test("existing config skips the setup block but marks onboarded", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), JSON.stringify({ promptsBetweenBreaks: 8 }));
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(readJson(join(dir, "state.json")).onboarded, true);
  assert.equal(readJson(join(dir, session("s1"))).promptCount, 1);
});

test("break fires at the prompt threshold and resets the counter", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  assert.equal(fire(dir, { session_id: "s1" }), null);
  const brk = fire(dir, { session_id: "s1" });
  assert.equal(brk.decision, "block");
  assert.match(brk.reason, /FITNESS BREAK TIME/);
  assert.match(brk.reason, /log-workout\.mjs' --exercise "NAME" --count N --unit reps\|seconds/);
  assert.doesNotMatch(brk.reason, /--calories/);
  const s = readJson(join(dir, session("s1")));
  assert.equal(s.promptCount, 0);
  assert.ok(s.lastBreakAt > 0);
  // cooldown (1 min) blocks an immediate second break
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
});

test("sessions count independently", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  assert.equal(fire(dir, { session_id: "a" }), null);
  assert.equal(fire(dir, { session_id: "b" }), null);
  assert.equal(fire(dir, { session_id: "b" }).decision, "block");
  assert.equal(readJson(join(dir, session("a"))).promptCount, 1);
});

test("pause suppresses breaks; expired pause is cleared", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true, pausedUntil: -1 }));
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  assert.equal(fire(dir, { session_id: "s1" }), null);
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true, pausedUntil: Date.now() - 1000 }));
  assert.equal(fire(dir, { session_id: "s1" }).decision, "block");
  assert.equal("pausedUntil" in readJson(join(dir, "state.json")), false);
});

test("stop_hook_active and malformed stdin exit silently without touching state", () => {
  const dir = tmp();
  assert.equal(fire(dir, { session_id: "s1", stop_hook_active: true }), null);
  assert.equal(fire(dir, "not json"), null);
  assert.equal(existsSync(join(dir, "state.json")), false);
});

test("missing session_id falls back to default and old sessions are pruned", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  fire(dir, { session_id: "stale" });
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  utimesSync(join(dir, session("stale")), old, old);
  fire(dir, {});
  assert.ok(existsSync(join(dir, session("default"))));
  assert.equal(existsSync(join(dir, session("stale"))), false);
});
