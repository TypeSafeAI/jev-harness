import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, unfavorable, JEV_MODEL } from "../src";
import { decideBase } from "../src/benchmark";
const ok = { ok: true, errors: [] };
const review = () => ({
  model: JEV_MODEL, error: null, source: "mock", latencyMs: 1,
  answers: {
    addresses_task: { probability: 1, answer: "yes", confidence: 1 },
    evidence_supports: { probability: 1, answer: "yes", confidence: 1 },
    unrelated_changes: { probability: 0, answer: "no", confidence: 1 },
    needs_clarification: { probability: 0, answer: "no", confidence: 1 },
  },
});

test("malformed validation and contradictory errors fail closed", () => {
  for (const input of [undefined, null, [], {}, { ok: "false", errors: [] }, { ok: 1, errors: [] }, { ok: true }, { ok: true, errors: ["failed"] }, { ok: true, errors: [1] }, { ok: true, errors: Array(1) }, { ok: false }]) {
    assert.equal(decide(input, review()).verdict, "reject");
    assert.equal(decideBase(input).verdict, "reject");
  }
});

test("missing and malformed review envelopes are unavailable rather than throwing", () => {
  for (const input of [undefined, null, [], {}, { ...review(), answers: undefined }, { ...review(), error: undefined }, { ...review(), source: "other" }, { ...review(), latencyMs: Infinity }, { ...review(), answers: [] }]) {
    assert.equal(decide(ok, input).verdict, "unavailable");
  }
  assert.equal(decide(ok, { ...review(), answers: {} }).verdict, "proposal_only");
  assert.equal(unfavorable(undefined).length, 4);
});

test("inherited data and accessors are not trusted as review fields", () => {
  assert.equal(decide(Object.create(ok), review()).verdict, "reject");
  assert.equal(decide(ok, Object.create(review())).verdict, "unavailable");
  const accessor = Object.defineProperty({}, "answers", { get() { throw Error("must not run"); } });
  assert.equal(decide(ok, accessor).verdict, "unavailable");
});

test("JSON round-trips remain usable and invalid configuration still throws", () => {
  assert.equal(decide(JSON.parse(JSON.stringify(ok)), JSON.parse(JSON.stringify(review()))).verdict, "permit");
  assert.throws(() => decide(undefined, undefined, 0.49), /between 0.5 and 1/);
});

test("validation error arrays cannot hide failures through iterators or getters", () => {
  let reads = 0;
  const iterator = ["validation failed"];
  Object.defineProperty(iterator, Symbol.iterator, { value: function* () { reads++; } });
  const getter = Object.defineProperty([], "0", { get() { reads++; return "failed"; } });
  const inherited = Object.setPrototypeOf(Array(1), { 0: "failed" });
  const decorated = Object.assign([], { ignored: "failed" });
  for (const errors of [iterator, getter, inherited, decorated]) {
    assert.equal(decide({ ok: true, errors }, review()).verdict, "reject");
    assert.equal(decideBase({ ok: true, errors }).verdict, "reject");
  }
  assert.equal(reads, 0);
});
