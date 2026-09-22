import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, JEV_MODEL, type JevReview, type ReviewAnswers } from "../src";
const answers: ReviewAnswers = {
  addresses_task: { probability: 1, answer: "yes", confidence: 1 },
  evidence_supports: { probability: 1, answer: "yes", confidence: 1 },
  unrelated_changes: { probability: 0, answer: "no", confidence: 1 },
  needs_clarification: { probability: 0, answer: "no", confidence: 1 },
};
const metadata = { model: JEV_MODEL, latencyMs: 1, source: "mock" as const };

test("a provider error wins over retained favorable answers", () => {
  for (const error of ["synthetic timeout", "", "cancelled"]) {
    // @ts-expect-error A success with an error is intentionally unrepresentable.
    const mixed: JevReview = { ...metadata, answers, error };
    const result = decide({ ok: true, errors: [] }, mixed);
    assert.equal(result.verdict, "unavailable");
    assert.match(result.reason, /never as safe/);
  }
});

test("failure, success, and validation precedence remain distinct", () => {
  const failed: JevReview = { ...metadata, answers: null, error: "synthetic failure" };
  const success: JevReview = { ...metadata, answers, error: null };
  assert.equal(decide({ ok: true, errors: [] }, failed).verdict, "unavailable");
  assert.equal(decide({ ok: true, errors: [] }, success).verdict, "permit");
  assert.equal(decide({ ok: false, errors: ["out of scope"] }, failed).verdict, "reject");
});
