import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyze, collect, miss, toMarkdown, type RunFile } from "../scripts/analyze-review-runs.js";
import type { JevReview } from "../src/contract/types.js";

// Tiny original synthetic runs. Arithmetic fixtures only; no live or recorded data.
const answer = (probability: number) => ({
  probability,
  answer: probability >= 0.5 ? ("yes" as const) : ("no" as const),
  confidence: Math.max(probability, 1 - probability),
});
const jev = (a: number, e: number, u: number, c: number): JevReview => ({
  model: "jev-1.13.0", source: "mock", latencyMs: 1, error: null,
  answers: { addresses_task: answer(a), evidence_supports: answer(e), unrelated_changes: answer(u), needs_clarification: answer(c) },
});
const ok = { ok: true, errors: [] as string[] };

function run(at: string, askExpected: string, goodEvidence: number, badAddresses: number): RunFile {
  return {
    at,
    runs: [
      { fixtureId: "sum-good", category: "clean", arm: "good", mode: "plus_jev", expected: "permit" },
      { fixtureId: "sum-bad", category: "clean", arm: "bad", mode: "plus_jev", expected: "proposal_only" },
      { fixtureId: "ask-good", category: "ambiguous", arm: "good", mode: "plus_jev", expected: askExpected },
      { fixtureId: "rejected-bad", category: "clean", arm: "bad", mode: "plus_jev", expected: "reject" },
    ],
    receipts: [
      { fixtureId: "sum-good", arm: "good", mode: "plus_jev", validation: ok, jev: jev(0.95, goodEvidence, 0.05, 0.1) },
      { fixtureId: "sum-bad", arm: "bad", mode: "plus_jev", validation: ok, jev: jev(badAddresses, 0.9, 0.05, 0.1) },
      { fixtureId: "ask-good", arm: "good", mode: "plus_jev", validation: ok, jev: jev(0.3, 0.3, 0.05, 0.9) },
      { fixtureId: "rejected-bad", arm: "bad", mode: "plus_jev", validation: { ok: false, errors: ["out of scope"] }, jev: null },
      { fixtureId: "sum-good", arm: "good", mode: "base", validation: ok, jev: null },
    ],
  };
}

const files = [run("2026-01-01T00:00:00Z", "permit", 0.7, 0.45), run("2026-01-02T00:00:00Z", "proposal_only", 0.9, 0.55)];

const repeated = () => {
  const repeats = [run("2026-01-01T00:00:00Z", "permit", 0.7, 0.45), run("2026-01-01T00:00:00Z", "permit", 0.6, 0.55)];
  return {
    at: repeats[0]!.at, repetitions: 2,
    runs: repeats.flatMap((file, index) => file.runs.map(row => ({ ...row, runIndex: index + 1 }))),
    receipts: repeats.flatMap((file, index) => file.receipts.map(receipt => ({ ...receipt, runIndex: index + 1 }))),
  };
};

test("legacy JSON and markdown analysis retain their exact output bytes", () => {
  const result = analyze(files);
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.deepEqual({ json: digest(JSON.stringify(result)), markdown: digest(toMarkdown(result)), collection: digest(JSON.stringify(collect(files))) }, {
    json: "095a7a724a604b96e51a5b00c66316abb183f69032e546910bba2e758d7c6b5b",
    markdown: "dac819d1b727d449482dd0e3e54529d12eeb23f4025192b755fc6da12b57911b",
    collection: "01aa05815d1b263de9ff5065dab5257f72958bbb3ca05b70cbcbb49ab3ae67a2",
  });
});

test("indexed repetitions and legacy files receive separate logical run identities", () => {
  const inputs = [repeated(), files[1]!];
  const { observations, conflicts, skipped } = collect(inputs);
  assert.deepEqual(observations.map(o => o.run), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
  assert.equal(skipped, 3);
  assert.deepEqual(conflicts, [{ fixtureId: "ask-good", arm: "good", labels: [{ run: 0, expected: "permit" }, { run: 1, expected: "permit" }, { run: 2, expected: "proposal_only" }], used: "proposal_only" }]);
  const result = analyze(inputs);
  assert.equal(result.runs, 3);
  assert.equal(result.observations, 9);
  assert.deepEqual(result.goodPermitMisses.map(m => m.run), [0, 1]);
  assert.deepEqual(collect([files[1]!, repeated()]).observations.map(o => o.run), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
});

test("indexed repeats are ordered by index rather than incoming receipt order", () => {
  const file = repeated();
  file.runs.reverse(); file.receipts.reverse();
  const observations = collect([file]).observations;
  assert.deepEqual(observations.filter(o => o.fixtureId === "sum-good").map(o => [o.run, o.answers.evidence_supports.probability]), [[0, 0.7], [1, 0.6]]);
});

test("malformed and mixed run indexes are rejected instead of pooling or dropping observations", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null, undefined]) {
    const file = repeated();
    (file.receipts[0] as { runIndex: unknown }).runIndex = value;
    assert.throws(() => collect([file]), /runIndex/, String(value));
    assert.throws(() => analyze([file]), /runIndex/, String(value));
  }
  for (const group of ["runs", "receipts"] as const) {
    const file = repeated();
    Reflect.deleteProperty(file[group][0]!, "runIndex");
    assert.throws(() => collect([file]), /runIndex/);
  }
  const mismatched = repeated();
  mismatched.receipts = mismatched.receipts.filter(receipt => receipt.runIndex === 1);
  assert.throws(() => analyze([mismatched]), /runIndex/);
  const outsidePlan = repeated();
  outsidePlan.receipts[0]!.runIndex = 3;
  assert.throws(() => collect([outsidePlan]), /runIndex/);
});

test("a cancelled indexed artifact counts only started repetitions, including unanswered ones", () => {
  const partial = repeated();
  partial.runs = partial.runs.filter(row => row.runIndex === 1);
  partial.receipts = partial.receipts.filter(row => row.runIndex === 1).map(row => ({ ...row, jev: null }));
  assert.equal(analyze([partial]).runs, 1);
  assert.equal(analyze([partial]).skippedWithoutAnswers, 4);
  partial.runs = []; partial.receipts = [];
  assert.equal(analyze([partial]).runs, 0);
});

test("later labels win, conflicts are reported, and unanswered receipts are skipped", () => {
  const { observations, conflicts, skipped } = collect(files);
  assert.equal(observations.length, 6);
  assert.equal(skipped, 2);
  assert.deepEqual(conflicts, [{ fixtureId: "ask-good", arm: "good", labels: [{ run: 0, expected: "permit" }, { run: 1, expected: "proposal_only" }], used: "proposal_only" }]);
  assert.ok(observations.filter(o => o.fixtureId === "ask-good").every(o => o.cls === "good_clarify"));
});

test("miss separates direction from confidence for canonical recorded answers", () => {
  assert.equal(miss("unrelated_changes", answer(0.6), 0.8), "direction");
  assert.equal(miss("addresses_task", answer(0.7), 0.8), "confidence");
  assert.equal(miss("addresses_task", answer(0.8), 0.8), null);
});

test("per-question and pooled sweeps count blocks and catches", () => {
  const result = analyze(files);
  const at = (q: string, floor: number) => result.questionSweep.find(r => r.question === q && r.floor === floor)!;
  // The good arm's evidence answer is 70% in run 1: blocked at 80%, not at 70%.
  assert.equal(at("evidence_supports", 0.7).goodBlocked, 0);
  assert.equal(at("evidence_supports", 0.8).goodBlocked, 1);
  assert.equal(at("evidence_supports", 0.8).goodBlockedSole, 1);
  // The bad arm flips direction on addresses_task: caught by direction in run 1, by confidence in run 2.
  assert.equal(at("addresses_task", 0.8).badCaughtDirection, 1);
  assert.equal(at("addresses_task", 0.8).badCaughtConfidence, 1);
  assert.equal(at("addresses_task", 0.5).badCaughtConfidence, 0);
  assert.equal(at("needs_clarification", 0.8).clarifyHeld, 2);
  const pooled = (floor: number) => result.pooledSweep.find(r => r.floor === floor)!;
  assert.deepEqual(pooled(0.5), { floor: 0.5, goodPermitBlocked: 0, goodPermitTotal: 2, clarifyPermitted: 0, badPermitted: 1, badTotal: 2 });
  assert.equal(pooled(0.8).badPermitted, 0);
  assert.equal(pooled(0.8).goodPermitBlocked, 1);
  const flips = result.variance.find(v => v.question === "addresses_task")!.flips;
  assert.deepEqual(flips, [{ fixtureId: "sum-bad", arm: "bad", probabilities: [0.45, 0.55] }]);
  assert.equal(result.badCatches[0]!.confidenceOnly, 1);
});
