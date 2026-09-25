/** Repeatable synthetic review measurements. The existing pipeline owns all verdicts. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateBench, benchRun, renderBenchTable, type BenchAggregate, type BenchRun } from "../../src/benchmark/bench.js";
import { loadFixtures } from "../../src/benchmark/load.js";
import { createMockTransport } from "../../src/benchmark/mock.js";
import { FixtureProposer } from "../../src/benchmark/proposer.js";
import { runProposalReview } from "../../src/benchmark/run.js";
import { FAVORABLE, REVIEW_CONFIDENCE_THRESHOLD } from "../../src/contract/decide.js";
import type { RunPayload } from "../../src/contract/payload.js";
import { REVIEW_QUESTIONS, UNTRUSTED_NOTE } from "../../src/contract/review.js";
import { JEV_MODEL, REVIEW_QUESTION_SET_VERSION, type Fixture, type JevSource, type JevTransport, type Receipt, type ReviewArm } from "../../src/contract/types.js";
import { reviewResponse, type ReviewMeasurement } from "../host/review-experiment.js";

const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const root = fileURLToPath(new URL("../../", import.meta.url));

export interface ReviewProvenance { revision: string | null; dirty: boolean | null; files: Array<{ path: string; sha256: string }> }

/** Hash current relevant bytes as well as HEAD, so dirty runs can be compared explicitly. */
export function reviewProvenance(): ReviewProvenance {
  let revision: string | null = null, dirty: boolean | null = null;
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (/^[a-f0-9]{40,64}$/.test(head)) revision = head;
    dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).length > 0;
  } catch { /* Missing Git provenance is unknown, never a clean-tree claim. */ }
  const paths = ["package.json", "pnpm-lock.yaml", "examples/host/jev-choice.ts", "examples/host/review-experiment.ts", "examples/review/experiment.ts", "examples/review/experiment-cli.ts", "scripts/experiment-review.ts"];
  for (const dir of ["src/contract", "src/benchmark", "fixtures/proposal-review"])
    paths.push(...readdirSync(join(root, dir)).filter(name => /\.(ts|json)$/.test(name)).map(name => `${dir}/${name}`));
  return { revision, dirty, files: paths.sort().map(path => ({ path, sha256: sha256(readFileSync(join(root, path))) })) };
}

export interface ReviewAttempt {
  attemptIndex: number;
  runIndex: number;
  fixtureId: string;
  arm: ReviewArm;
  source: JevSource;
  startedAt: string;
  finishedAt: string;
  status: "answered" | "unavailable" | "cancelled";
  requestBody: string;
  requestHash: string;
  requestBytes: number;
  responseBytes: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  dispatched: boolean;
  httpStatus: number | null;
  failure: ReviewMeasurement["failure"];
}
type IndexedReceipt = Receipt & { runIndex: number; observationId: string; attemptIndex: number | null };
type IndexedBenchRun = BenchRun & { runIndex: number; observationId: string };

export interface ReviewExperimentDeps {
  source: JevSource;
  fixtures?: Fixture[];
  transport?: JevTransport<RunPayload>;
  measurement?: () => ReviewMeasurement | null;
  provenance?: ReviewProvenance;
  now?: () => string;
  clock?: () => number;
  signal?: AbortSignal;
}

/** This repeat count is cases on the same frozen suite, not new adversarial coverage. */
export async function runReviewExperiment(options: { runs: number }, deps: ReviewExperimentDeps) {
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 4) throw Error("--runs must be an integer from 1 to 4.");
  const fixtures = structuredClone(deps.fixtures ?? loadFixtures());
  const transport = deps.transport ?? (deps.source === "mock" ? createMockTransport(fixtures) : null);
  if (!transport) throw Error("Live review requires a host transport.");
  const provenance = structuredClone(deps.provenance ?? reviewProvenance());
  const now = deps.now ?? (() => new Date().toISOString()), clock = deps.clock ?? (() => performance.now());
  const at = now(), artifactId = randomUUID();
  const questionsJson = JSON.stringify(REVIEW_QUESTIONS);
  const profileJson = JSON.stringify({ model: JEV_MODEL, questionSetVersion: REVIEW_QUESTION_SET_VERSION, threshold: REVIEW_CONFIDENCE_THRESHOLD, favorable: FAVORABLE, questions: REVIEW_QUESTIONS, note: UNTRUSTED_NOTE });
  const fixturesJson = JSON.stringify(fixtures);
  const metadata = {
    provenance, questionsJson, questionHash: sha256(questionsJson), profileJson, profileHash: sha256(profileJson), fixturesJson, fixtureHash: sha256(fixturesJson),
    evaluation: { purpose: "evaluation_only" as const, labels: fixtures.map(f => ({ fixtureId: f.id, category: f.category, expected: f.expected, mock: f.mock })) },
    fixtureFiles: fixtures.map(f => ({ fixtureId: f.id, files: Object.entries(f.files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({ path, sha256: sha256(content) })) })),
  };
  const proposer = new FixtureProposer(), attempts: ReviewAttempt[] = [], receipts: IndexedReceipt[] = [], runs: IndexedBenchRun[] = [];
  const summaries: Array<{ runIndex: number; aggregate: BenchAggregate; table: string }> = [];
  for (let runIndex = 1; runIndex <= options.runs; runIndex++) {
    if (deps.signal?.aborted) break;
    const repetition: BenchRun[] = [];
    for (const fixture of fixtures) {
      for (const arm of ["good", "bad"] as const) {
        if (deps.signal?.aborted) break;
        const common = { arm, source: deps.source, now, clock, ...(deps.signal ? { signal: deps.signal } : {}) };
        const base = await runProposalReview(fixture, proposer, null, { ...common, mode: "base" });
        let attempt: ReviewAttempt | null = null;
        const measured: JevTransport<RunPayload> = async (payload, signal) => {
          const requestBody = JSON.stringify(payload), started = clock();
          const current: ReviewAttempt = { attemptIndex: attempts.length + 1, runIndex, fixtureId: fixture.id, arm, source: deps.source, startedAt: now(), finishedAt: now(), status: "unavailable", requestBody, requestHash: sha256(requestBody), requestBytes: Buffer.byteLength(requestBody, "utf8"), responseBytes: null, inputTokens: null, outputTokens: null, latencyMs: 0, dispatched: true, httpStatus: null, failure: null };
          attempt = current; attempts.push(current);
          try {
            const response = reviewResponse(await transport(payload, signal));
            current.inputTokens = response.usage.input_tokens;
            current.outputTokens = response.usage.output_tokens;
            return response;
          } catch {
            current.failure = signal?.aborted ? "cancelled" : "transport_error";
            throw Error("Review transport did not return a usable response.");
          } finally {
            current.finishedAt = now(); current.latencyMs = Math.max(0, clock() - started);
            const measurement = deps.measurement?.();
            if (measurement) Object.assign(current, measurement);
          }
        };
        const plus = await runProposalReview(fixture, proposer, measured, { ...common, mode: "plus_jev" });
        // The callback assigns attempt; TS cannot infer that across the awaited pipeline.
        const completed = attempt as ReviewAttempt | null;
        if (completed) {
          completed.status = deps.signal?.aborted ? "cancelled" : plus.receipt.jev?.answers ? "answered" : "unavailable";
          if (completed.status === "cancelled") completed.failure = "cancelled";
          else if (completed.status === "unavailable") completed.failure ??= "malformed_response";
        }
        for (const { receipt } of [base, plus]) {
          const observationId = `${artifactId}:${runIndex}:${fixture.id}:${arm}:${receipt.mode}`;
          receipts.push({ ...receipt, runIndex, observationId, attemptIndex: receipt.mode === "plus_jev" ? completed?.attemptIndex ?? null : null });
          const row = benchRun(fixture, receipt);
          repetition.push(row); runs.push({ ...row, runIndex, observationId });
        }
      }
      if (deps.signal?.aborted) break;
    }
    const aggregate = aggregateBench(repetition);
    summaries.push({ runIndex, aggregate, table: renderBenchTable(aggregate) });
  }
  const plus = receipts.filter(r => r.mode === "plus_jev"), plannedPlusJevCases = fixtures.length * 2 * options.runs;
  const usage = (field: "inputTokens" | "outputTokens") => ({ knownSum: attempts.reduce((sum, a) => sum + (a[field] ?? 0), 0), knownAttempts: attempts.filter(a => a[field] !== null).length, unknownAttempts: attempts.filter(a => a[field] === null).length });
  return {
    schemaVersion: 1 as const, artifactId, at, finishedAt: now(), status: deps.signal?.aborted ? "cancelled" as const : "complete" as const,
    source: deps.source, model: JEV_MODEL, threshold: REVIEW_CONFIDENCE_THRESHOLD, questionSetVersion: REVIEW_QUESTION_SET_VERSION,
    repetitions: options.runs, fixtures: fixtures.length, metadata, runs, receipts, attempts, summaries,
    accounting: { plannedPlusJevCases, plusJevCases: plus.length, baseCases: receipts.length - plus.length, notStarted: plannedPlusJevCases - plus.length, validationRejected: plus.filter(r => !r.validation.ok).length, transportAttempts: attempts.length, providerAttempts: deps.source === "jev" ? attempts.filter(a => a.dispatched).length : 0, retries: 0, answered: attempts.filter(a => a.status === "answered").length, unavailable: plus.filter(r => r.verdict === "unavailable").length },
    reportedUsage: { inputTokens: usage("inputTokens"), outputTokens: usage("outputTokens") },
    limitations: "Synthetic scripted proposals; repeats measure repeatability, not new coverage or calibration. Mock usage is unknown. No proposal was applied or executed. Digests are not authentication.",
  };
}
