import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDir, readJson, writeJson, readConfig, DEFAULTS } from "../scripts/lib/paths.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "clawdbod-paths-"));

test("dataDir prefers override, then env, then home", () => {
  assert.equal(dataDir("/x"), "/x");
  process.env.CLAWDBOD_DATA_DIR = "/y";
  assert.equal(dataDir(), "/y");
  delete process.env.CLAWDBOD_DATA_DIR;
  assert.match(dataDir(), /\.claude\/clawdbod$/);
});

test("readJson returns fallback on missing or malformed file", () => {
  const dir = tmp();
  assert.deepEqual(readJson(join(dir, "nope.json"), { a: 1 }), { a: 1 });
  writeFileSync(join(dir, "bad.json"), "{not json");
  assert.equal(readJson(join(dir, "bad.json"), null), null);
  writeFileSync(join(dir, "arr.json"), "[1,2]");
  assert.deepEqual(readJson(join(dir, "arr.json"), {}), {});
});

test("writeJson creates parent dirs and round-trips", () => {
  const dir = tmp();
  const p = join(dir, "a", "b", "s.json");
  writeJson(p, { hello: "world" });
  assert.deepEqual(JSON.parse(readFileSync(p, "utf-8")), { hello: "world" });
});

test("readConfig applies defaults, clamps, and env overrides", () => {
  const dir = tmp();
  delete process.env.CLAWDBOD_PROMPTS;
  delete process.env.CLAWDBOD_MINUTES;
  let c = readConfig(dir);
  assert.equal(c.exists, false);
  assert.equal(c.promptsBetweenBreaks, DEFAULTS.promptsBetweenBreaks);
  assert.equal(c.profile, null);

  writeFileSync(join(dir, "config.json"), JSON.stringify({ promptsBetweenBreaks: 5000, minMinutesBetweenBreaks: "abc", profile: { weight_lbs: 180 } }));
  c = readConfig(dir);
  assert.equal(c.exists, true);
  assert.equal(c.promptsBetweenBreaks, 1000);
  assert.equal(c.minMinutesBetweenBreaks, DEFAULTS.minMinutesBetweenBreaks);
  assert.deepEqual(c.profile, { weight_lbs: 180 });

  process.env.CLAWDBOD_PROMPTS = "3";
  assert.equal(readConfig(dir).promptsBetweenBreaks, 3);
  delete process.env.CLAWDBOD_PROMPTS;
});
