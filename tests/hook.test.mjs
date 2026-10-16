import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, utimesSync } from "node:fs";
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

// A session that started an hour ago, so the minute floor never gates the first break.
function seasoned(dir, ...ids) {
  mkdirSync(join(dir, "sessions"), { recursive: true });
  for (const id of ids) {
    writeFileSync(join(dir, session(id)), JSON.stringify({ promptCount: 0, lastBreakAt: 0, startedAt: Date.now() - 3600000 }));
  }
}

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
  seasoned(dir, "s1");
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
  seasoned(dir, "a", "b");
  assert.equal(fire(dir, { session_id: "a" }), null);
  assert.equal(fire(dir, { session_id: "b" }), null);
  assert.equal(fire(dir, { session_id: "b" }).decision, "block");
  assert.equal(readJson(join(dir, session("a"))).promptCount, 1);
});

test("pause suppresses breaks; expired pause is cleared", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  seasoned(dir, "s1");
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

test("first break respects the minute floor, measured from session start", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  const env = { CLAWDBOD_PROMPTS: "2", CLAWDBOD_MINUTES: "20" };
  assert.equal(fire(dir, { session_id: "s1" }, env), null);
  // prompt threshold reached, but the session is seconds old
  assert.equal(fire(dir, { session_id: "s1" }, env), null);
  assert.ok(readJson(join(dir, session("s1"))).startedAt > 0);
  // age the session past the floor
  const p = join(dir, session("s1"));
  const s = readJson(p);
  writeFileSync(p, JSON.stringify({ ...s, startedAt: Date.now() - 25 * 60000 }));
  const brk = fire(dir, { session_id: "s1" }, env);
  assert.equal(brk.decision, "block");
  assert.match(brk.reason, /\(25 min into this session\)/);
  assert.doesNotMatch(brk.reason, /\d{5,} min/);
});

test("2.1.0 session files (lastBreakAt 0, no startedAt) get a fresh cooldown, not an instant break", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true }));
  const p = join(dir, session("old"));
  fire(dir, { session_id: "old" }, { CLAWDBOD_MINUTES: "20" }); // creates sessions dir
  writeFileSync(p, JSON.stringify({ promptCount: 50, lastBreakAt: 0 }));
  assert.equal(fire(dir, { session_id: "old" }, { CLAWDBOD_MINUTES: "20" }), null);
});

test("a clock that jumped backwards does not suppress breaks forever", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true }));
  fire(dir, { session_id: "s1" });
  const p = join(dir, session("s1"));
  const future = Date.now() + 2 * 3600000;
  writeFileSync(p, JSON.stringify({ promptCount: 50, lastBreakAt: future, startedAt: future }));
  // first fire clamps the future timestamps to now; cooldown (1 min) then applies normally
  assert.equal(fire(dir, { session_id: "s1" }), null);
  const s = readJson(p);
  assert.ok(s.lastBreakAt <= Date.now() && s.startedAt <= Date.now());
  writeFileSync(p, JSON.stringify({ ...s, lastBreakAt: Date.now() - 2 * 60000 }));
  assert.equal(fire(dir, { session_id: "s1" }).decision, "block");
});

test("a pause set absurdly far in the future (clock skew) is treated as expired", () => {
  const dir = tmp();
  writeFileSync(join(dir, "config.json"), "{}");
  writeFileSync(join(dir, "state.json"), JSON.stringify({ onboarded: true, pausedUntil: Date.now() + 30 * 86400000 }));
  fire(dir, { session_id: "s1" });
  assert.equal("pausedUntil" in readJson(join(dir, "state.json")), false);
});

test("hooks.json lets the shell expand CLAUDE_PLUGIN_ROOT (never single-quoted)", () => {
  const hooksJson = JSON.parse(readFileSync(join(dirname(HOOK), "hooks.json"), "utf-8"));
  const commands = Object.values(hooksJson.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.length >= 2);
  for (const c of commands) {
    assert.doesNotMatch(c, /'[^']*\$\{CLAUDE_PLUGIN_ROOT\}/, c);
    assert.match(c, /"\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[a-z-]+\.mjs"/, c);
  }
});
