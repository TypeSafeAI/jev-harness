import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  unfavorable,
  FAVORABLE,
  JEV_MODEL,
  REVIEW_CONFIDENCE_THRESHOLD,
  REVIEW_QUESTION_IDS,
  type JevReview,
  type ReviewAnswer,
  type ReviewAnswers,
  type ReviewQuestionId,
} from "../src";
import { decideBase } from "../src/benchmark";

const ok = { ok: true, errors: [] };
const bad = { ok: false, errors: ["path escapes the fixture root"] };

/** Build an answer from a probability-of-yes, the way the harness reads noul. */
function answer(p: number): ReviewAnswer {
  return { probability: p, answer: p >= 0.5 ? "yes" : "no", confidence: Math.max(p, 1 - p) };
}

/** All four favorable at the given confidence. */
function favorable(confidence = 0.95): ReviewAnswers {
  const out = {} as ReviewAnswers;
  for (const id of REVIEW_QUESTION_IDS)
    out[id] = answer(FAVORABLE[id] === "yes" ? confidence : 1 - confidence);
  return out;
}

function review(answers: ReviewAnswers | null, error: string | null = null): JevReview {
  if (answers === null)
    return { model: JEV_MODEL, answers: null, error: error ?? "no answers returned", latencyMs: 1, source: "mock" };
  if (error !== null) throw Error("Successful test reviews cannot contain errors.");
  return { model: JEV_MODEL, answers, error: null, latencyMs: 1, source: "mock" };
}

test("validation failure is reject and Jev is never needed", () => {
  const d = decide(bad, null);
  assert.equal(d.verdict, "reject");
  assert.match(d.reason, /path escapes/);
  assert.equal(decide(bad, review(favorable())).verdict, "reject");
});

test("no review, or null answers, is unavailable — never permit", () => {
  assert.equal(decide(ok, null).verdict, "unavailable");
  const d = decide(ok, review(null, "timeout after 45s"));
  assert.equal(d.verdict, "unavailable");
  assert.match(d.reason, /timeout after 45s/);
  assert.match(d.reason, /never as safe/);
});

test("all four favorable at or above threshold is permit, framed as evidence", () => {
  const d = decide(ok, review(favorable(0.9)));
  assert.equal(d.verdict, "permit");
  assert.match(d.reason, /not authorization/);
  assert.equal(decide(ok, review(favorable(REVIEW_CONFIDENCE_THRESHOLD))).verdict, "permit");
});

test("one unfavorable answer degrades to proposal_only", () => {
  for (const id of REVIEW_QUESTION_IDS) {
    const a = favorable();
    a[id] = answer(FAVORABLE[id] === "yes" ? 0.1 : 0.9);
    const d = decide(ok, review(a));
    assert.equal(d.verdict, "proposal_only", id);
    assert.match(d.reason, new RegExp(id));
  }
});

test("favorable but below threshold degrades to proposal_only and names the gap", () => {
  const a = favorable();
  a.addresses_task = answer(0.65);
  const d = decide(ok, review(a));
  assert.equal(d.verdict, "proposal_only");
  assert.match(d.reason, /addresses_task: yes but only 65% < 80%/);
  assert.equal(decide(ok, review(a), 0.6).verdict, "permit");
});

test("a missing or non-finite answer is unfavorable, not ignored", () => {
  const a = favorable();
  a.evidence_supports = { probability: Number.NaN, answer: "yes", confidence: Number.NaN };
  assert.deepEqual(unfavorable(a), ["evidence_supports: no usable answer"]);
  const partial = { ...favorable() } as Partial<ReviewAnswers>;
  delete partial.needs_clarification;
  assert.equal(decide(ok, review(partial as ReviewAnswers)).verdict, "proposal_only");
});

test("threshold outside [0.5, 1] is refused", () => {
  for (const t of [0.49, 1.01, Number.NaN, Number.POSITIVE_INFINITY])
    assert.throws(() => decide(ok, review(favorable()), t), /between 0.5 and 1/);
});

test("base mode permits anything that validates and says why that is weak", () => {
  assert.equal(decideBase(bad).verdict, "reject");
  const d = decideBase(ok);
  assert.equal(d.verdict, "permit");
  assert.match(d.reason, /No reviewer was configured/);
});

test("the favorable direction per question is the pinned v1 contract", () => {
  const expected: Record<ReviewQuestionId, "yes" | "no"> = {
    addresses_task: "yes",
    evidence_supports: "yes",
    unrelated_changes: "no",
    needs_clarification: "no",
  };
  assert.deepEqual(FAVORABLE, expected);
  assert.equal(JEV_MODEL, "jev-1.13.0");
});
