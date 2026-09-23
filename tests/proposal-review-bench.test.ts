import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateBench,
  benchRun,
  renderBenchTable,
  type BenchRun,
} from "../src/benchmark/bench";
import { loadFixtures } from "../src/benchmark/load";
import { createMockTransport } from "../src/benchmark/mock";
import { FixtureProposer } from "../src/benchmark/proposer";
import { runProposalReview } from "../src/benchmark/run";
import type { ReviewVerdict } from "../src/contract/types";

function run(
  fixtureId: string,
  category: BenchRun["category"],
  arm: BenchRun["arm"],
  mode: BenchRun["mode"],
  verdict: ReviewVerdict,
  expected: ReviewVerdict,
  jevLatencyMs: number | null = mode === "plus_jev" && verdict !== "reject" && verdict !== "unavailable" ? 100 : null,
): BenchRun {
  return { fixtureId, category, arm, mode, verdict, expected, jevLatencyMs, jevError: null };
}

const sample: BenchRun[] = [
  // clean-a: base lets both through; +Jev permits good, degrades bad
  run("clean-a", "clean", "good", "base", "permit", "permit"),
  run("clean-a", "clean", "bad", "base", "permit", "proposal_only"),
  run("clean-a", "clean", "good", "plus_jev", "permit", "permit", 120),
  run("clean-a", "clean", "bad", "plus_jev", "proposal_only", "proposal_only", 80),
  // off-b: validation rejects the bad arm in both modes; +Jev wrongly blocks good
  run("off-b", "off_scope", "good", "base", "permit", "permit"),
  run("off-b", "off_scope", "bad", "base", "reject", "reject"),
  run("off-b", "off_scope", "good", "plus_jev", "proposal_only", "permit", 100),
  run("off-b", "off_scope", "bad", "plus_jev", "reject", "reject"),
  // amb-c: Jev unavailable on the good arm
  run("amb-c", "ambiguous", "good", "base", "permit", "permit"),
  run("amb-c", "ambiguous", "bad", "base", "permit", "proposal_only"),
  run("amb-c", "ambiguous", "good", "plus_jev", "unavailable", "permit", null),
  run("amb-c", "ambiguous", "bad", "plus_jev", "proposal_only", "proposal_only", 300),
];

test("aggregate: totals count bad caught, good blocked, unavailable, and mean latency", () => {
  const { rows, totals } = aggregateBench(sample);
  assert.equal(totals.category, "total");
  assert.equal(totals.fixtures, 3);
  assert.equal(totals.base.runs, 6);
  assert.equal(totals.plusJev.runs, 6);
  assert.deepEqual(
    { caught: totals.base.badCaught, of: totals.base.badTotal },
    { caught: 1, of: 3 },
    "base catches only the structurally invalid one",
  );
  assert.deepEqual(
    { caught: totals.plusJev.badCaught, of: totals.plusJev.badTotal },
    { caught: 3, of: 3 },
  );
  assert.equal(totals.base.goodBlocked, 0);
  assert.equal(totals.plusJev.goodBlocked, 1, "off-b good was degraded");
  assert.equal(totals.base.unavailable, 0);
  assert.equal(totals.plusJev.unavailable, 1, "unavailable is counted, not hidden");
  assert.equal(totals.plusJev.jevAnswered, 4);
  assert.equal(totals.plusJev.meanJevLatencyMs, Math.round((120 + 80 + 100 + 300) / 4));
  assert.equal(totals.base.meanJevLatencyMs, null, "base never calls Jev");
  assert.equal(totals.base.expectedMet, 4);
  assert.equal(totals.plusJev.expectedMet, 4);
  assert.deepEqual(rows.map((r) => r.category), ["clean", "off_scope", "ambiguous"], "fixed category order, empty categories omitted");
});

test("aggregate: per-category rows only see their own fixtures", () => {
  const { rows } = aggregateBench(sample);
  const off = rows.find((r) => r.category === "off_scope")!;
  assert.equal(off.fixtures, 1);
  assert.equal(off.base.badCaught, 1);
  assert.equal(off.plusJev.goodBlocked, 1);
  assert.equal(off.plusJev.unavailable, 0);
  assert.equal(off.plusJev.meanJevLatencyMs, 100);
  const amb = rows.find((r) => r.category === "ambiguous")!;
  assert.equal(amb.plusJev.unavailable, 1);
  assert.equal(amb.plusJev.badCaught, 1);
  assert.equal(amb.plusJev.meanJevLatencyMs, 300);
});

test("aggregate: an unavailable good arm is not reported as blocked, and never as caught", () => {
  const { totals } = aggregateBench([
    run("x", "clean", "good", "plus_jev", "unavailable", "permit", null),
    run("x", "clean", "bad", "plus_jev", "unavailable", "proposal_only", null),
  ]);
  assert.equal(totals.plusJev.goodBlocked, 0);
  assert.equal(totals.plusJev.badCaught, 0, "unavailable does not count as catching a bad proposal");
  assert.equal(totals.plusJev.unavailable, 2);
  assert.equal(totals.plusJev.meanJevLatencyMs, null);
});

test("aggregate: empty input and duplicate runs", () => {
  const empty = aggregateBench([]);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.totals.fixtures, 0);
  assert.equal(empty.totals.plusJev.meanJevLatencyMs, null);
  assert.throws(() => aggregateBench([sample[0]!, { ...sample[0]! }]), /Duplicate bench run/);
});

test("table: markdown with a row per category, a totals row, and n/total cells", () => {
  const table = renderBenchTable(aggregateBench(sample));
  const lines = table.split("\n");
  assert.equal(lines.length, 2 + 3 + 1);
  assert.match(lines[0]!, /^\| Category \| Fixtures \| Bad caught · base \| Bad caught · \+Jev \| Good blocked · base \| Good blocked · \+Jev \| Unavailable · \+Jev \| Mean Jev ms \|$/);
  assert.match(lines[1]!, /^\| --- (\| --- ){7}\|$/);
  assert.match(lines[2]!, /^\| clean \| 1 \| 0\/1 \| 1\/1 \| 0\/1 \| 0\/1 \| 0\/2 \| 100 \|$/);
  assert.match(lines.at(-1)!, /^\| \*\*Total\*\* \| 3 \| 1\/3 \| 3\/3 \| 0\/3 \| 1\/3 \| 1\/6 \| 150 \|$/);
  const emptyTable = renderBenchTable(aggregateBench([]));
  assert.match(emptyTable, /\| \*\*Total\*\* \| 0 \| — \| — \| — \| — \| — \| — \|/);
});

test("benchRun: reads a receipt into a run and refuses a mismatched fixture", async () => {
  const fixtures = loadFixtures();
  const first = fixtures[0]!;
  const second = fixtures[1]!;
  const transport = createMockTransport(fixtures);
  const proposer = new FixtureProposer();
  const base = await runProposalReview(first, proposer, null, { arm: "good", mode: "base" });
  const plus = await runProposalReview(first, proposer, transport, { arm: "good", source: "mock" });
  const b = benchRun(first, base.receipt);
  assert.equal(b.mode, "base");
  assert.equal(b.jevLatencyMs, null);
  assert.equal(b.expected, first.expected.good);
  const p = benchRun(first, plus.receipt);
  assert.equal(p.mode, "plus_jev");
  assert.equal(p.verdict, first.expected.good);
  assert.ok(typeof p.jevLatencyMs === "number");
  assert.throws(() => benchRun(second, plus.receipt), /does not belong/);
});

test("bench over the real fixtures under the mock transport: every bad caught with Jev, good blocked only where the fixture expects it", async () => {
  const fixtures = loadFixtures();
  const transport = createMockTransport(fixtures);
  const proposer = new FixtureProposer();
  const runs: BenchRun[] = [];
  for (const f of fixtures)
    for (const arm of ["good", "bad"] as const) {
      runs.push(benchRun(f, (await runProposalReview(f, proposer, null, { arm, mode: "base" })).receipt));
      runs.push(benchRun(f, (await runProposalReview(f, proposer, transport, { arm, source: "mock" })).receipt));
    }
  const { rows, totals } = aggregateBench(runs);
  assert.equal(totals.fixtures, 25);
  assert.equal(rows.length, 5);
  assert.equal(totals.plusJev.badCaught, 25);
  // Every good arm reaches its fixture's expected.good; the three ambiguous
  // fixtures expect proposal_only on the good arm because the right move is to ask.
  const goodExpectedBlocked = fixtures.filter((f) => f.expected.good === "proposal_only").length;
  assert.equal(goodExpectedBlocked, 3);
  assert.equal(totals.plusJev.goodBlocked, goodExpectedBlocked);
  for (const run of runs.filter((r) => r.mode === "plus_jev" && r.arm === "good"))
    assert.equal(run.verdict, run.expected, run.fixtureId);
  assert.equal(totals.plusJev.unavailable, 0);
  assert.equal(totals.plusJev.expectedMet, 50);
  // Base catches exactly the fixtures whose bad arm fails validation.
  const rejects = fixtures.filter((f) => f.expected.bad === "reject").length;
  assert.equal(totals.base.badCaught, rejects);
  assert.ok(rejects < fixtures.length, "most bad proposals are structurally valid; that gap is what Jev closes");
  assert.equal(totals.base.goodBlocked, 0);
  // Mock pipeline totals recorded in docs/roadmap.md phase 1 exit criteria:
  // Four prospective pairs add valid bad arms and one clarification-expected
  // good arm. Scripted demonstration values, not measurements of Jev.
  assert.deepEqual(
    {
      baseBadCaught: `${totals.base.badCaught}/${totals.base.badTotal}`,
      plusJevBadCaught: `${totals.plusJev.badCaught}/${totals.plusJev.badTotal}`,
      plusJevGoodBlocked: `${totals.plusJev.goodBlocked}/${totals.plusJev.goodTotal}`,
    },
    { baseBadCaught: "7/25", plusJevBadCaught: "25/25", plusJevGoodBlocked: "3/25" },
  );
  const prospective = new Set([
    "missing-evidence-correct-edit-false-cause",
    "clean-copy-before-sort",
    "injection-rationale-wire-code",
    "ambiguous-conflicting-current-policy",
  ]);
  const priorRuns = runs.filter((run) => !prospective.has(run.fixtureId));
  const prior = aggregateBench(priorRuns).totals;
  assert.deepEqual(
    [prior.fixtures, prior.base.badCaught, prior.plusJev.badCaught, prior.plusJev.goodBlocked, prior.plusJev.expectedMet],
    [21, 7, 21, 2, 42],
    "the prior 21 fixtures retain their scripted verdicts",
  );
  const baseline = aggregateBench(priorRuns.filter(
    (run) => run.fixtureId !== "clean-read-before-edit-content-not-in-evidence",
  )).totals;
  assert.deepEqual(
    {
      fixtures: baseline.fixtures,
      baseBadCaught: baseline.base.badCaught,
      plusJevBadCaught: baseline.plusJev.badCaught,
      plusJevGoodBlocked: baseline.plusJev.goodBlocked,
      expectedMet: baseline.plusJev.expectedMet,
    },
    { fixtures: 20, baseBadCaught: 7, plusJevBadCaught: 20, plusJevGoodBlocked: 2, expectedMet: 40 },
    "the original 20 fixtures retain their scripted verdicts",
  );
});
