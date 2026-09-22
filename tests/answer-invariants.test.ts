import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, FAVORABLE, JEV_MODEL, REVIEW_QUESTION_IDS, type ReviewAnswer, type ReviewAnswers } from "../src";

const ok = { ok: true, errors: [] };
const answer = (p: number): ReviewAnswer => ({ probability: p, answer: p >= 0.5 ? "yes" : "no", confidence: Math.max(p, 1 - p) });
function favorable(): ReviewAnswers {
  return Object.fromEntries(REVIEW_QUESTION_IDS.map(id => [id, answer(FAVORABLE[id] === "yes" ? 0.95 : 0.05)])) as ReviewAnswers;
}
const review = (answers: ReviewAnswers) => ({ model: JEV_MODEL, answers, error: null, latencyMs: 1, source: "mock" as const });

test("contradictory answer triples cannot permit", () => {
  for (const id of REVIEW_QUESTION_IDS) {
    const a = favorable();
    a[id] = { probability: FAVORABLE[id] === "yes" ? 0.01 : 0.99, answer: FAVORABLE[id], confidence: 0.99 };
    assert.equal(decide(ok, review(a)).verdict, "proposal_only", id);
    a[id] = { probability: 0.5, answer: FAVORABLE[id], confidence: 0.99 };
    assert.equal(decide(ok, review(a)).verdict, "proposal_only", id);
  }
});

test("finite but out-of-range probabilities and confidence cannot permit", () => {
  for (const p of [-1, 2, Number.MAX_VALUE, -Number.MIN_VALUE]) {
    const a = favorable();
    a.addresses_task = answer(p);
    assert.equal(decide(ok, review(a)).verdict, "proposal_only");
  }
  for (const confidence of [-1, 0.49, 1.01, 2, Number.NaN, Infinity]) {
    const a = favorable();
    a.addresses_task.confidence = confidence;
    assert.equal(decide(ok, review(a)).verdict, "proposal_only");
  }
});

test("canonical probability grid preserves the v1 decision table", () => {
  const values = [0, 0.1, 0.5, 0.9, 1];
  for (const p of values) for (const q of values) for (const r of values) for (const s of values) {
    const answers = { addresses_task: answer(p), evidence_supports: answer(q), unrelated_changes: answer(r), needs_clarification: answer(s) };
    const expected = p >= 0.8 && q >= 0.8 && r <= 0.2 && s <= 0.2 ? "permit" : "proposal_only";
    assert.equal(decide(ok, review(answers)).verdict, expected);
  }
});

test("canonical JSON answers preserve threshold endpoints and name every miss", () => {
  const answers = favorable();
  for (const id of REVIEW_QUESTION_IDS) answers[id] = answer(FAVORABLE[id] === "yes" ? 1 : 0);
  const parsed = JSON.parse(JSON.stringify(review(answers)));
  assert.equal(decide(ok, parsed, 1).verdict, "permit");
  for (const id of REVIEW_QUESTION_IDS) answers[id] = answer(0.5);
  const result = decide(ok, review(answers), 0.5);
  assert.equal(result.verdict, "proposal_only");
  assert.match(result.reason, /unrelated_changes/);
  assert.match(result.reason, /needs_clarification/);
  assert.doesNotMatch(result.reason, /addresses_task|evidence_supports/);
});
