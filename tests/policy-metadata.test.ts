import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, FAVORABLE, PROPOSAL_TOOLS, REVIEW_QUESTION_IDS, JEV_MODEL } from "../src";

test("exported policy metadata is frozen at runtime", () => {
  for (const value of [FAVORABLE, REVIEW_QUESTION_IDS, PROPOSAL_TOOLS])
    assert.equal(Object.isFrozen(value), true);
  assert.equal(Reflect.set(FAVORABLE, "addresses_task", "no"), false);
  assert.equal(Reflect.set(REVIEW_QUESTION_IDS, "length", 0), false);
  assert.equal(Reflect.set(PROPOSAL_TOOLS, "0", "execute"), false);
  assert.equal(FAVORABLE.addresses_task, "yes");
  assert.equal(REVIEW_QUESTION_IDS.length, 4);
  assert.equal(PROPOSAL_TOOLS[0], "read_file");
});

test("attempting metadata changes cannot bypass answer evaluation", () => {
  const ok = { ok: true, errors: [] };
  const empty = { model: JEV_MODEL, answers: {}, error: null, source: "mock", latencyMs: 0 };
  assert.equal(decide(ok, empty).verdict, "proposal_only");
  assert.equal(Reflect.set(REVIEW_QUESTION_IDS, "length", 0), false);
  assert.equal(decide(ok, empty).verdict, "proposal_only");
  const compileTimeReadonly = () => {
    // @ts-expect-error FAVORABLE is part of the immutable decision policy.
    FAVORABLE.addresses_task = "no";
    // @ts-expect-error Question IDs are a readonly tuple.
    REVIEW_QUESTION_IDS.length = 0;
  };
  assert.equal(typeof compileTimeReadonly, "function");
});
