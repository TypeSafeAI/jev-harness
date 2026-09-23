import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, collect, miss, type RunFile } from "../scripts/analyze-review-runs.js";
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
