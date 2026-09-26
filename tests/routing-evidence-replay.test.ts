import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPERIMENT_TASKS } from "../examples/routing/experiment-tasks.js";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const runs = join(root, "docs/routing-evaluation/runs");
const blinder = join(runs, "2026-09-25-jev-blind-routing.mts");
const batches = {
  A: "routing-package-baseline",
  B: "routing-package-prerequisites",
  C: "routing-package-inspector-attempt2",
  D: "routing-package-fixture-tools-attempt2",
  E: "routing-package-v4-control",
  F: "routing-package-v4-integrated",
  G: "routing-package-v4-integrated-repeat",
  H: "routing-package-v5-integrated",
};

test("retained routing blinder reads task definitions from its relocated checkout", async t => {
  const directory = await mkdtemp(join(tmpdir(), "jev-evidence-relocated-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const script = join(directory, "docs/routing-evaluation/runs/blind.mts");
  const tasks = join(directory, "examples/routing/experiment-tasks.ts");
  await mkdir(dirname(script), { recursive: true });
  await mkdir(dirname(tasks), { recursive: true });
  await copyFile(blinder, script);
  // A different synthetic sentinel makes accidental imports from another checkout observable.
  await writeFile(tasks, `export const EXPERIMENT_TASKS = ${JSON.stringify(EXPERIMENT_TASKS.map(task => ({ ...task, intent: "relocated synthetic task" })))};\n`);
  const prefix = join(directory, "output");
  await exec(process.execPath, ["--import", import.meta.resolve("tsx"), script,
    join(root, "examples/routing/runs/2026-09-25-routing-package-baseline.json"), prefix], { cwd: directory });
  const rows = (await readFile(`${prefix}.jsonl`, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(rows.length, 114);
  assert.ok(rows.every(row => row.task.intent === "relocated synthetic task"));
});

for (const [label, batch] of Object.entries(batches)) {
  test(`routing ${label} regenerates the exact blinded inputs and case mapping offline`, async t => {
    const directory = await mkdtemp(join(tmpdir(), "jev-evidence-replay-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const date = label === "H" ? "2026-09-26" : "2026-09-25";
    const artifact = join(root, `examples/routing/runs/${date}-${batch}.json`);
    const prefix = join(directory, "output");
    await exec(process.execPath, ["--import", import.meta.resolve("tsx"), blinder, artifact, prefix], { cwd: directory });
    assert.equal(await readFile(`${prefix}.jsonl`, "utf8"), await readFile(join(runs, `${date}-blind-${label}.jsonl`), "utf8"));
    const actual = JSON.parse(await readFile(`${prefix}-mapping.json`, "utf8"));
    const expected = JSON.parse(await readFile(join(runs, `${date}-blind-${label}-mapping.json`), "utf8"));
    for (const row of actual.cases) assert.equal(row.artifactPath, artifact);
    // Recorded bytes and identities stay fixed; only the location of the source file moves.
    for (const row of expected.cases) row.artifactPath = artifact;
    assert.deepEqual(actual, expected);
  });
}
