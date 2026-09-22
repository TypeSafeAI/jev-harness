/**
 * Offline base-vs-+Jev proposal-review bench over fixtures/proposal-review.
 *
 *   pnpm bench:review
 *
 * Mock transport only: no credentials, no network, no provider calls. Runs
 * every fixture x {good, bad} x {base, plus_jev} and prints a markdown table
 * plus a JSON summary. The scripted mock values are demonstration values, not
 * measurements of Jev. Nothing is applied or executed.
 *
 * Adapted from TypeSafeAI/typesafe-playground `scripts/proposal-review-bench.ts`
 * at 2c6cac903ee3887eb72548e012c14a7aefe4f3bd without its `--live` mode.
 */
import { JEV_MODEL, REVIEW_CONFIDENCE_THRESHOLD, REVIEW_QUESTION_SET_VERSION } from "../src/contract/index.js";
import { aggregateBench, benchRun, renderBenchTable, type BenchRun } from "../src/benchmark/bench.js";
import { loadFixtures } from "../src/benchmark/load.js";
import { createMockTransport, MOCK_MODEL } from "../src/benchmark/mock.js";
import { FixtureProposer } from "../src/benchmark/proposer.js";
import { runProposalReview } from "../src/benchmark/run.js";

const fixtures = loadFixtures();
const transport = createMockTransport(fixtures);
const proposer = new FixtureProposer();
const runs: BenchRun[] = [];
for (const fixture of fixtures)
  for (const arm of ["good", "bad"] as const) {
    runs.push(benchRun(fixture, (await runProposalReview(fixture, proposer, null, { arm, mode: "base" })).receipt));
    runs.push(benchRun(fixture, (await runProposalReview(fixture, proposer, transport, { arm, source: "mock" })).receipt));
  }
const aggregate = aggregateBench(runs);
const { base, plusJev } = aggregate.totals;
console.log(
  `MOCK · model ${MOCK_MODEL} · requested ${JEV_MODEL} · question set v${REVIEW_QUESTION_SET_VERSION} · threshold ${REVIEW_CONFIDENCE_THRESHOLD} · ${fixtures.length} fixtures\n` +
    "Scripted demonstration values, not measurements of Jev.\n\n" +
    `${renderBenchTable(aggregate)}\n`,
);
console.log(JSON.stringify({
  source: "mock",
  fixtures: fixtures.length,
  baseBadCaught: `${base.badCaught}/${base.badTotal}`,
  plusJevBadCaught: `${plusJev.badCaught}/${plusJev.badTotal}`,
  plusJevGoodBlocked: `${plusJev.goodBlocked}/${plusJev.goodTotal}`,
  plusJevUnavailable: `${plusJev.unavailable}/${plusJev.runs}`,
  expectedMet: `${plusJev.expectedMet}/${plusJev.runs}`,
}));
if (plusJev.expectedMet !== plusJev.runs) process.exitCode = 1;
