import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JEV_MODEL,
  REVIEW_QUESTION_IDS,
  REVIEW_QUESTION_SET_VERSION,
  REVIEW_QUESTIONS,
  REVIEW_QUESTION_CRITERIA,
  UNTRUSTED_NOTE,
  buildReviewPayload,
  reviewProposal,
  validateReviewPayload,
  type Proposal,
  type RunPayload,
} from "../src";
import { loadFixtures } from "../src/benchmark/load";
import { createMockTransport } from "../src/benchmark/mock";
import { FixtureProposer } from "../src/benchmark/proposer";
import { runProposalReview } from "../src/benchmark/run";

// Original synthetic content for this test only.
const fixture = {
  task: "Rename the greeting from Hi to Hello in src/greet.ts.",
  files: { "src/greet.ts": 'export const greeting = "Hi";\n' },
  evidence: ['export const greeting = "Hi";'],
};
const proposal: Proposal = {
  tool: "propose_patch",
  path: "src/greet.ts",
  patch: '--- a/src/greet.ts\n+++ b/src/greet.ts\n@@ -1 +1 @@\n-export const greeting = "Hi";\n+export const greeting = "Hello";\n',
  rationale: "The task asks for Hello.",
  evidence: ['export const greeting = "Hi";'],
};

function capture() {
  const sent: unknown[] = [];
  const transport = async (payload: RunPayload) => {
    // Serialize exactly as an HTTP transport would.
    sent.push(JSON.parse(JSON.stringify(payload)));
    return {
      model: JEV_MODEL,
      answers: Object.fromEntries(REVIEW_QUESTION_IDS.map((id) => [id, { type: "noul", noul: 0.5 }])),
    };
  };
  return { sent, transport };
}

test("exact post-validation request reaching the transport: pinned model, note, four instruction-only v1 questions", async () => {
  const { sent, transport } = capture();
  const review = await reviewProposal(fixture, proposal, transport, { clock: () => 0 });
  assert.equal(sent.length, 1);
  assert.deepStrictEqual(sent[0], {
    model: "jev-1.13.0",
    state: {
      note: UNTRUSTED_NOTE,
      task: fixture.task,
      evidence: fixture.evidence,
      files: fixture.files,
      proposal: {
        tool: "propose_patch",
        path: "src/greet.ts",
        patch: proposal.patch,
        rationale: proposal.rationale,
        evidence: proposal.evidence,
      },
    },
    questions: {
      addresses_task: { type: "noul", instructions: REVIEW_QUESTIONS.addresses_task.instructions },
      evidence_supports: { type: "noul", instructions: REVIEW_QUESTIONS.evidence_supports.instructions },
      unrelated_changes: { type: "noul", instructions: REVIEW_QUESTIONS.unrelated_changes.instructions },
      needs_clarification: { type: "noul", instructions: REVIEW_QUESTIONS.needs_clarification.instructions },
    },
  });
  assert.match(UNTRUSTED_NOTE, /untrusted data/);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(review.payload)), sent[0]);
  assert.equal(REVIEW_QUESTION_SET_VERSION, 1);
});

test("v1 instructions match the README contract table", () => {
  const readme = readFileSync("README.md", "utf8");
  for (const id of REVIEW_QUESTION_IDS)
    assert.ok(readme.includes(`| \`${id}\` | ${REVIEW_QUESTIONS[id].instructions} |`), id);
});

test("fixture labels, ids, and categories never reach the transport", async () => {
  const fixtures = loadFixtures();
  const { sent, transport } = capture();
  for (const f of fixtures)
    for (const arm of ["good", "bad"] as const)
      await runProposalReview(f, new FixtureProposer(), transport, { arm, source: "mock" });
  assert.ok(sent.length > 0);
  const forbidden = new Set(["arm", "expected", "mock", "category", "id", "fixtureId", "proposals"]);
  const keys = (value: unknown, out: string[] = []): string[] => {
    if (Array.isArray(value)) value.forEach((v) => keys(v, out));
    else if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        out.push(k);
        // File names inside `files` are content, not structure.
        if (k !== "files") keys(v, out);
      }
    return out;
  };
  for (const payload of sent) {
    const state = (payload as { state: Record<string, unknown> }).state;
    assert.deepEqual(Object.keys(state), ["note", "task", "evidence", "files", "proposal"]);
    for (const key of keys(payload)) assert.equal(forbidden.has(key), false, key);
    const text = JSON.stringify(payload);
    for (const f of fixtures) assert.equal(text.includes(f.id), false, f.id);
  }
});

test("explicitly supplied noul criteria survive validation byte for byte, next to an instruction-only question", async () => {
  const withCriteria = {
    ...buildReviewPayload(fixture, proposal),
    questions: {
      addresses_task: { ...REVIEW_QUESTIONS.addresses_task, criteria: { ...REVIEW_QUESTION_CRITERIA.addresses_task } },
      evidence_supports: { ...REVIEW_QUESTIONS.evidence_supports },
    },
  };
  const validated = validateReviewPayload(withCriteria);
  const { sent, transport } = capture();
  await transport(validated);
  assert.deepStrictEqual((sent[0] as RunPayload).questions, {
    addresses_task: {
      type: "noul",
      instructions: REVIEW_QUESTIONS.addresses_task.instructions,
      criteria: {
        true: REVIEW_QUESTION_CRITERIA.addresses_task.true,
        false: REVIEW_QUESTION_CRITERIA.addresses_task.false,
      },
    },
    evidence_supports: { type: "noul", instructions: REVIEW_QUESTIONS.evidence_supports.instructions },
  });
  assert.equal((sent[0] as RunPayload).model, JEV_MODEL);
});

test("malformed noul criteria fail validation instead of being dropped", () => {
  const base = buildReviewPayload(fixture, proposal);
  const withCriteria = (criteria: unknown) => ({
    ...base,
    questions: { addresses_task: { type: "noul", instructions: "x", criteria } },
  });
  for (const criteria of [
    { true: "yes" },
    { true: "yes", false: "" },
    { true: "yes", false: "no", maybe: "?" },
    ["yes", "no"],
    { true: 1, false: 0 },
    null,
    "yes/no",
  ])
    assert.throws(() => validateReviewPayload(withCriteria(criteria)), /criteria/, JSON.stringify(criteria));
});

test("the payload validator never substitutes a model alias", () => {
  const base = buildReviewPayload(fixture, proposal);
  assert.throws(() => validateReviewPayload({ ...base, model: "" }), /pinned model/);
  assert.throws(() => validateReviewPayload({ ...base, model: undefined }), /pinned model/);
  assert.equal(validateReviewPayload(base).model, JEV_MODEL);
});

test("policy objects are frozen", () => {
  assert.equal(Object.isFrozen(REVIEW_QUESTIONS), true);
  assert.equal(Object.isFrozen(REVIEW_QUESTIONS.addresses_task), true);
  assert.equal(Object.isFrozen(REVIEW_QUESTION_CRITERIA), true);
  assert.equal(Object.isFrozen(REVIEW_QUESTION_CRITERIA.needs_clarification), true);
});

test("the mock transport answers from the proposal alone", async () => {
  const fixtures = loadFixtures();
  const transport = createMockTransport(fixtures);
  const f = fixtures[0]!;
  const payload = validateReviewPayload(buildReviewPayload(f, f.proposals.good));
  const reply = (await transport(payload)) as { answers: Record<string, { noul: number }> };
  assert.equal(reply.answers.addresses_task!.noul, f.mock.good.addresses_task);
});
