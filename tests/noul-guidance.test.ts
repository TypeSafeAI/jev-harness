import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REVIEW_QUESTION_SET_VERSION, JEV_MODEL, REVIEW_CONFIDENCE_THRESHOLD } from "../src";

test("Noul guidance preserves criteria support without claiming a wire change", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const note = readFileSync("docs/hardening/07-noul-contract.md", "utf8");
  assert.match(agents, /supports optional `criteria/);
  assert.doesNotMatch(agents, /questions have no `criteria` field/);
  assert.match(note, /does not yet contain the\npayload builder/);
  assert.match(note, /uncalibrated/);
  assert.equal(REVIEW_QUESTION_SET_VERSION, 1);
  assert.equal(JEV_MODEL, "jev-1.13.0");
  assert.equal(REVIEW_CONFIDENCE_THRESHOLD, 0.8);
});
