import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { main } from "../examples/context-scoring-shadow/cli.js";
import { DEMO_INPUT, scriptedFakeAdapter } from "../examples/context-scoring-shadow/demo.js";
import { runContextShadowExperiment } from "../examples/context-scoring-shadow/experiment.js";
import { parseReportFormat, renderReport } from "../examples/context-scoring-shadow/report.js";
import { JEV_MODEL, QUESTION_SET_VERSION, UNTRUSTED_DATA_NOTE, type ContextShadowInput, type ScoringAdapter, type ScoringCall } from "../examples/context-scoring-shadow/types.js";

function responseFor(
  call: ScoringCall,
  probabilities: Readonly<Record<string, number>>,
  options: { model?: string; source?: string; usage?: { inputTokens: number; outputTokens: number } } = {},
) {
  const answers = Object.fromEntries(
    Object.entries(call.questionToChunkId).map(([questionId, chunkId]) => [
      questionId,
      probabilities[chunkId] ?? 0.5,
    ]),
  );
  return {
    source: options.source ?? "scripted_fake",
    model: options.model ?? JEV_MODEL,
    answers,
    ...(options.usage === undefined ? {} : { usage: options.usage }),
  };
}

const DEMO_PROBABILITIES = Object.freeze({ timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 });

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

function markdownSection(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1);
  const end = markdown.indexOf("\n#", start + heading.length);
  return markdown.slice(start, end === -1 ? undefined : end);
}

function fixedAdapter(
  probabilities: Readonly<Record<string, number>>,
  options: (call: ScoringCall) => { model?: string; source?: string; usage?: { inputTokens: number; outputTokens: number } } = () => ({}),
): ScoringAdapter {
  return {
    kind: "scripted_fake",
    score: async call => responseFor(call, probabilities, options(call)),
  };
}

test("both layouts preserve chunk identity and send only Noul request fields", async () => {
  const calls: ScoringCall[] = [];
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    async score(call) {
      calls.push(structuredClone(call));
      return responseFor(call, { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 });
    },
  };
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter);
  const fanOut = calls.filter(call => call.layout === "fan_out");
  const perChunk = calls.filter(call => call.layout === "per_chunk");
  assert.equal(fanOut.length, 1);
  assert.equal(perChunk.length, DEMO_INPUT.chunks.length);
  assert.equal(fanOut[0]!.body.model, JEV_MODEL);
  assert.deepEqual(fanOut[0]!.body.state, {
    note: UNTRUSTED_DATA_NOTE,
    task: DEMO_INPUT.task,
  });
  assert.equal(QUESTION_SET_VERSION, "context-relevance-v2");
  assert.equal(result.questionSetVersion, QUESTION_SET_VERSION);
  for (const call of fanOut) {
    assert.deepEqual(Object.keys(call.questionToChunkId), Object.keys(call.body.questions));
    assert.equal(call.body.state.note, UNTRUSTED_DATA_NOTE);
    for (const [questionId, chunkId] of Object.entries(call.questionToChunkId)) {
      const question = call.body.questions[questionId]!;
      assert.equal(question.type, "noul");
      assert.deepEqual(question.criteria, {
        true: "The chunk contains information that could materially help answer the task.",
        false: "The chunk is unrelated, decorative, or otherwise does not help answer the task.",
      });
      const instructions = question.instructions as { question: string; context_chunk: { id: string; text: string } };
      assert.equal(instructions.question, "Could this context chunk help answer the task as stated?");
      assert.deepEqual(Object.keys(instructions), ["question", "context_chunk"]);
      assert.equal(instructions.context_chunk.id, chunkId);
      assert.equal(instructions.context_chunk.text, DEMO_INPUT.chunks.find(chunk => chunk.id === chunkId)!.text);
    }
  }
  for (const call of perChunk) {
    const id = call.questionToChunkId.is_relevant!;
    assert.equal(call.body.state.note, UNTRUSTED_DATA_NOTE);
    assert.equal((call.body.state.context_chunk as { id: string }).id, id);
    assert.deepEqual(Object.keys(call.body.questions), ["is_relevant"]);
    assert.equal(typeof call.body.questions.is_relevant!.instructions, "string");
    assert.ok(call.body.questions.is_relevant!.criteria.true);
    assert.deepEqual(call.body.questions.is_relevant, {
      type: "noul",
      instructions: "Could this context chunk help answer the task as stated?",
      criteria: {
        true: "The chunk contains information that could materially help answer the task.",
        false: "The chunk is unrelated, decorative, or otherwise does not help answer the task.",
      },
    });
  }
  for (const call of calls) {
    const wire = JSON.stringify(call.body);
    assert.equal(Object.hasOwn(call.body.state, "relevant"), false);
    assert.equal(wire.includes("aggregateCachedInputTokens"), false);
    assert.equal(wire.includes("cacheObservations"), false);
    assert.equal(wire.includes('"relevant":'), false);
  }
  assert.deepEqual(result.layouts.fan_out.evidence.map(row => row.chunkId), DEMO_INPUT.chunks.map(chunk => chunk.id));
  assert.deepEqual(result.layouts.per_chunk.evidence.map(row => row.chunkId), DEMO_INPUT.chunks.map(chunk => chunk.id));
});

test("evaluation labels do not change adapter inputs or scripted fake evidence", async () => {
  const relabeled = structuredClone(DEMO_INPUT);
  relabeled.chunks.forEach(chunk => { chunk.relevant = !chunk.relevant; });
  const firstCalls: ScoringCall[] = [];
  const secondCalls: ScoringCall[] = [];
  const recordAdapter = (calls: ScoringCall[]): ScoringAdapter => ({
    kind: "scripted_fake",
    async score(call) {
      calls.push(structuredClone(call));
      return scriptedFakeAdapter.score(call);
    },
  });
  const first = await runContextShadowExperiment(structuredClone(DEMO_INPUT), recordAdapter(firstCalls));
  const second = await runContextShadowExperiment(relabeled, recordAdapter(secondCalls));
  assert.deepEqual(firstCalls, secondCalls);
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.deepEqual(first.layouts[layout].evidence, second.layouts[layout].evidence);
  }
  assert.notDeepEqual(first.input.chunks.map(chunk => chunk.relevant), second.input.chunks.map(chunk => chunk.relevant));
});

test("each layout serializes each chunk text once and measures its actual request bodies", async () => {
  const input = structuredClone(DEMO_INPUT);
  input.chunks[0]!.text = 'Synthetic timeout note: "café" takes 250 ms.\nNo retry.';
  const calls: ScoringCall[] = [];
  const result = await runContextShadowExperiment(input, {
    kind: "scripted_fake",
    async score(call) {
      calls.push(structuredClone(call));
      return scriptedFakeAdapter.score(call);
    },
  });
  for (const layout of ["fan_out", "per_chunk"] as const) {
    const bodies = calls.filter(call => call.layout === layout).map(call => JSON.stringify(call.body));
    for (const chunk of input.chunks) {
      const occurrences = bodies.reduce((sum, body) => sum + body.split(JSON.stringify(chunk.text)).length - 1, 0);
      assert.equal(occurrences, 1, `${layout} must carry ${chunk.id} text exactly once`);
    }
    const sizes = bodies.map(body => Buffer.byteLength(body, "utf8"));
    assert.equal(result.layouts[layout].metrics.plannedRequestBytes, sizes.reduce((sum, size) => sum + size, 0));
    assert.equal(result.layouts[layout].metrics.plannedRequestTokenProxy, sizes.reduce((sum, size) => sum + Math.ceil(size / 4), 0));
  }
});

test("the committed sample exactly matches CLI JSON and Markdown has distinct layout headings", async () => {
  const jsonRun = capture();
  assert.equal(await main([], jsonRun.io), 0);
  assert.equal(jsonRun.stderr(), "");
  const json = jsonRun.stdout();
  const sample = readFileSync(new URL("../examples/context-scoring-shadow/sample-result.json", import.meta.url), "utf8");
  assert.equal(json, sample, "Regenerate with pnpm --silent experiment:context-shadow > examples/context-scoring-shadow/sample-result.json");
  const markdownRun = capture();
  assert.equal(await main(["--format", "markdown"], markdownRun.io), 0);
  const markdown = markdownRun.stdout();
  assert.equal(markdown, renderReport(JSON.parse(json), "markdown"));
  assert.ok(markdown.includes("### All chunks in one request (fan_out)"));
  assert.ok(markdown.includes("### One request per chunk (per_chunk)"));
  assert.equal(markdown.includes("not drop recommendations"), false);
});

test("the CLI returns 2 on usage errors without output and accepts a pnpm argument separator", async () => {
  const bogus = capture();
  assert.equal(await main(["--bogus"], bogus.io), 2);
  assert.equal(bogus.stdout(), "");
  assert.match(bogus.stderr(), /Unsupported option: --bogus\. Usage: pnpm experiment:context-shadow/);
  const badFormat = capture();
  assert.equal(await main(["--format", "live"], badFormat.io), 2);
  assert.equal(badFormat.stdout(), "");
  const separated = capture();
  assert.equal(await main(["--", "--format", "markdown"], separated.io), 0);
  assert.equal(separated.stderr(), "");
  assert.ok(separated.stdout().startsWith("# Context scoring shadow experiment\n"));
});

test("the runner preserves caller context and snapshots task, chunks, labels, and cost before awaiting", async () => {
  const input = structuredClone(DEMO_INPUT);
  const original = structuredClone(input);
  const originalJson = JSON.stringify(input);
  const pendingCalls: ScoringCall[] = [];
  let release: ((value: unknown) => void) | undefined;
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    score(call) {
      pendingCalls.push(structuredClone(call));
      if (call.layout === "fan_out") {
        return new Promise(resolve => { release = resolve; });
      }
      return scriptedFakeAdapter.score(call);
    },
  };
  const pending = runContextShadowExperiment(input, adapter);
  input.task = "changed after start";
  input.chunks[0]!.text = "changed after start";
  input.chunks[0]!.relevant = false;
  input.cacheObservations!.aggregateCachedInputTokens = 999999;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pendingCalls[0]!.body.state.task, original.task);
  const batchCall = pendingCalls[0]!;
  release!(responseFor(batchCall, { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 }));
  const artifact = await pending;
  assert.deepEqual(artifact.input, original);
  assert.equal(JSON.stringify(artifact.input), originalJson);
  assert.equal(JSON.stringify(input) === originalJson, false, "only the test's own mutations changed its input");
});

test("a normal shadow run leaves the caller context byte-for-byte unchanged", async () => {
  const input = structuredClone(DEMO_INPUT);
  const before = JSON.stringify(input);
  await runContextShadowExperiment(input, scriptedFakeAdapter);
  assert.equal(JSON.stringify(input), before);
});

test("threshold endpoints are fixed and uncertain scores are retained", async () => {
  const values = [0, 0.1999, 0.2, 0.8, 0.8001, 1];
  const input: ContextShadowInput = {
    task: "Synthetic threshold boundary check.",
    chunks: values.map((_, index) => ({ id: `chunk_${index}`, text: `Synthetic chunk ${index}.`, relevant: index === 2 || index === 3 })),
  };
  const probabilities = Object.fromEntries(values.map((value, index) => [`chunk_${index}`, value]));
  const result = await runContextShadowExperiment(input, fixedAdapter(probabilities));
  for (const layout of ["fan_out", "per_chunk"] as const) {
    const evidence = result.layouts[layout];
    assert.deepEqual(evidence.proposedDropIds, ["chunk_0", "chunk_1"]);
    assert.deepEqual(evidence.uncertainIds, ["chunk_2", "chunk_3"]);
    assert.deepEqual(evidence.proposedKeepIds, ["chunk_2", "chunk_3", "chunk_4", "chunk_5"]);
    assert.equal(evidence.relevanceRecall, 1);
    assert.deepEqual(evidence.evidence.map(row => row.probability), values);
    const markdown = renderReport(result, "markdown");
    assert.ok(markdown.includes("| `chunk_1` | 0.1999 | would_drop |"));
    assert.ok(markdown.includes("| `chunk_2` | 0.2 | uncertain_retained |"));
    assert.ok(markdown.includes("| `chunk_4` | 0.8001 | relevant_retained |"));
  }
});

test("missing or malformed answer ids make an incomplete layout retain every chunk", async () => {
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    async score(call) {
      if (call.layout === "per_chunk" && call.requestId === "per_chunk:timeout_caller") {
        return { source: "scripted_fake", model: JEV_MODEL, answers: { unexpected_answer: 0.01 } };
      }
      return responseFor(call, { timeout_config: 0.05, timeout_caller: 0.05, button_styles: 0.05 });
    },
  };
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter);
  const failed = result.layouts.per_chunk;
  assert.equal(failed.status, "unavailable");
  assert.deepEqual(failed.proposedDropIds, []);
  assert.deepEqual(failed.proposedKeepIds, DEMO_INPUT.chunks.map(chunk => chunk.id));
  assert.equal(failed.relevanceRecall, null);
  assert.ok(failed.failures.some(failure => failure.code === "missing_evidence"));
  assert.equal(result.layouts.fan_out.proposedDropIds.length, DEMO_INPUT.chunks.length);
});

test("null answer maps and out-of-range probabilities make evidence unavailable", async () => {
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    async score(call) {
      if (call.layout === "fan_out") return { source: "scripted_fake", model: JEV_MODEL, answers: null };
      if (call.requestId === "per_chunk:timeout_caller") {
        return { source: "scripted_fake", model: JEV_MODEL, answers: { is_relevant: 1.01 } };
      }
      return responseFor(call, { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 });
    },
  };
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter);
  assert.equal(result.layouts.fan_out.status, "unavailable");
  assert.deepEqual(result.layouts.fan_out.proposedDropIds, []);
  assert.ok(result.layouts.fan_out.failures.every(failure => failure.code === "malformed_response"));
  assert.equal(result.layouts.per_chunk.status, "unavailable");
  assert.deepEqual(result.layouts.per_chunk.proposedDropIds, []);
  assert.ok(result.layouts.per_chunk.failures.some(failure => failure.code === "malformed_response"));
});

test("wrong-model and claimed-live responses are unavailable and cannot relabel the artifact", async () => {
  const wrongModel = await runContextShadowExperiment(
    structuredClone(DEMO_INPUT),
    fixedAdapter({ timeout_config: 0.99, timeout_caller: 0.99, button_styles: 0.01 }, () => ({ model: "jev-latest" })),
  );
  assert.equal(wrongModel.layouts.fan_out.status, "unavailable");
  assert.deepEqual(wrongModel.layouts.fan_out.proposedDropIds, []);
  assert.ok(wrongModel.layouts.fan_out.failures.every(failure => failure.code === "wrong_model"));

  const claimsLive = await runContextShadowExperiment(
    structuredClone(DEMO_INPUT),
    fixedAdapter({ timeout_config: 0.99, timeout_caller: 0.99, button_styles: 0.01 }, () => ({ source: "live" })),
  );
  assert.equal(claimsLive.layouts.fan_out.status, "unavailable");
  assert.deepEqual(claimsLive.layouts.fan_out.proposedDropIds, []);
  assert.ok(claimsLive.layouts.fan_out.failures.every(failure => failure.code === "unsupported_provenance"));
  assert.deepEqual(claimsLive.provenance, { label: "synthetic demonstration", adapter: "scripted_fake", live: false });
  assert.equal(claimsLive.model, JEV_MODEL);
});

test("cancellation while a request is pending settles promptly and yields no drop recommendation", async () => {
  const controller = new AbortController();
  let release: ((value: unknown) => void) | undefined;
  let started: (() => void) | undefined;
  const didStart = new Promise<void>(resolve => { started = resolve; });
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    score(call) {
      if (call.layout === "fan_out") {
        return new Promise(resolve => {
          release = resolve;
          started!();
        });
      }
      return scriptedFakeAdapter.score(call);
    },
  };
  const pending = runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter, { signal: controller.signal });
  await didStart;
  controller.abort();
  const result = await pending;
  release!(responseFor({ layout: "fan_out", requestId: "fan_out:all", questionToChunkId: { relevance_timeout_config: "timeout_config" }, body: { model: JEV_MODEL, state: {}, questions: {} } }, { timeout_config: 0.01 }));
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.equal(result.layouts[layout].status, "unavailable");
    assert.deepEqual(result.layouts[layout].proposedDropIds, []);
    assert.deepEqual(result.layouts[layout].proposedKeepIds, DEMO_INPUT.chunks.map(chunk => chunk.id));
    assert.ok(result.layouts[layout].failures.some(failure => failure.code === "cancelled"));
  }
});

test("an abort queued just after a response still suppresses that response's evidence", async () => {
  const controller = new AbortController();
  const base = fixedAdapter({ timeout_config: 0.99, timeout_caller: 0.99, button_styles: 0.01 });
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    async score(call, signal) {
      const response = await base.score(call, signal);
      if (call.requestId === "per_chunk:button_styles") {
        queueMicrotask(() => queueMicrotask(() => controller.abort()));
      }
      return response;
    },
  };
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter, { signal: controller.signal });
  assert.equal(result.layouts.per_chunk.status, "unavailable");
  assert.deepEqual(result.layouts.per_chunk.proposedDropIds, []);
  assert.deepEqual(result.layouts.per_chunk.proposedKeepIds, DEMO_INPUT.chunks.map(chunk => chunk.id));
  assert.equal(result.layouts.per_chunk.evidence[2]!.probability, null);
  assert.ok(result.layouts.per_chunk.failures.some(failure => failure.code === "cancelled"));
});

test("cancelling a middle per-chunk request marks the remaining calls once without sending them", async () => {
  const controller = new AbortController();
  const sent: string[] = [];
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) {
      sent.push(call.requestId);
      if (call.requestId === "per_chunk:timeout_caller") controller.abort();
      return scriptedFakeAdapter.score(call);
    },
  }, { signal: controller.signal });
  assert.deepEqual(sent, ["fan_out:all", "per_chunk:timeout_config", "per_chunk:timeout_caller"]);
  const layout = result.layouts.per_chunk;
  assert.equal(layout.status, "unavailable");
  assert.deepEqual(layout.failures, [
    { requestId: "per_chunk:timeout_caller", code: "cancelled" },
    { requestId: "per_chunk:button_styles", code: "cancelled" },
  ]);
  assert.deepEqual(layout.evidence.map(row => row.probability), [0.94, null, null]);
  assert.deepEqual(layout.proposedDropIds, []);
  assert.deepEqual(layout.proposedKeepIds, DEMO_INPUT.chunks.map(chunk => chunk.id));
});

function measuredCostInput(): ContextShadowInput {
  const base = structuredClone(DEMO_INPUT);
  const segments = (contextUncached: number, contextRead: number, contextWrite: number) => [
    { segment: "prefix" as const, uncachedTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0 },
    { segment: "context" as const, uncachedTokens: contextUncached, cacheReadTokens: contextRead, cacheWriteTokens: contextWrite },
    { segment: "suffix" as const, uncachedTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 5 },
  ];
  const disposition = {
    keptChunkIds: ["timeout_config", "timeout_caller"],
    droppedChunkIds: ["button_styles"],
  };
  base.cacheObservations = {
    assumptions: {
      asOf: "2026-09-22",
      source: "Synthetic test price assumptions.",
      proposerModel: "synthetic-proposer",
      proposer: { inputUsdPerMillion: 2, cacheReadUsdPerMillion: 0.2, cacheWriteUsdPerMillion: 4 },
      jev: { inputUsdPerMillion: 0.042, outputUsdPerMillion: 0.5 },
    },
    byLayout: {
      fan_out: {
        baselineSegments: segments(100, 50, 10),
        counterfactual: { ...disposition, segments: segments(40, 30, 5) },
      },
      per_chunk: {
        baselineSegments: segments(100, 50, 10),
        counterfactual: { ...disposition, segments: segments(40, 30, 5) },
      },
    },
  };
  return base;
}

test("aggregate-only cache counts stay unknown; complete bound observations permit illustrative arithmetic", async () => {
  const aggregateInput = measuredCostInput();
  delete aggregateInput.cacheObservations!.byLayout;
  aggregateInput.cacheObservations!.aggregateCachedInputTokens = 1200;
  const aggregateOnly = await runContextShadowExperiment(aggregateInput, scriptedFakeAdapter);
  assert.equal(aggregateOnly.layouts.fan_out.costEstimate.status, "unknown");
  assert.match(aggregateOnly.layouts.fan_out.costEstimate.reason, /segment-level/);

  const withObservations = await runContextShadowExperiment(
    measuredCostInput(),
    fixedAdapter(
      { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 },
      call => ({ usage: { inputTokens: call.layout === "fan_out" ? 100 : 50, outputTokens: 2 } }),
    ),
  );
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.equal(withObservations.layouts[layout].costEstimate.status, "estimated");
    assert.equal(withObservations.layouts[layout].costEstimate.assumptions?.asOf, "2026-09-22");
    assert.ok(Number.isFinite(withObservations.layouts[layout].costEstimate.netSavingsUsd));
  }
  const fanOutCost = withObservations.layouts.fan_out.costEstimate;
  assert.ok(Math.abs(fanOutCost.baselineProposerUsd! - 0.000294) < 1e-15);
  assert.ok(Math.abs(fanOutCost.counterfactualProposerUsd! - 0.00015) < 1e-15);
  assert.ok(Math.abs(fanOutCost.scoringUsd! - 0.0000052) < 1e-15);
  assert.ok(Math.abs(fanOutCost.netSavingsUsd! - 0.0001388) < 1e-15);
  const perChunkCost = withObservations.layouts.per_chunk.costEstimate;
  assert.ok(Math.abs(perChunkCost.baselineProposerUsd! - 0.000294) < 1e-15);
  assert.ok(Math.abs(perChunkCost.counterfactualProposerUsd! - 0.00015) < 1e-15);
  assert.ok(Math.abs(perChunkCost.scoringUsd! - 0.0000093) < 1e-15);
  assert.ok(Math.abs(perChunkCost.netSavingsUsd! - 0.0001347) < 1e-15);
  assert.match(fanOutCost.reason, /caller-supplied baseline and counterfactual segment inputs/);
  const markdown = renderReport(withObservations, "markdown");
  assert.ok(markdown.includes("net savings $0.00013880 (positive means scoring is cheaper; excludes recall-error cost and latency)"));
});

test("cost remains unknown for incomplete segment or turn/layout bindings", async () => {
  const input = measuredCostInput();
  input.cacheObservations!.byLayout!.fan_out!.counterfactual.droppedChunkIds = [];
  const adapter = fixedAdapter(
    { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 },
    () => ({ usage: { inputTokens: 100, outputTokens: 2 } }),
  );
  const result = await runContextShadowExperiment(input, adapter);
  assert.equal(result.layouts.fan_out.costEstimate.status, "unknown");
  assert.match(result.layouts.fan_out.costEstimate.reason, /exact keep\/drop sets/);

  const malformed = measuredCostInput();
  malformed.cacheObservations!.byLayout!.fan_out!.baselineSegments = [
    { segment: "context", uncachedTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ];
  const malformedResult = await runContextShadowExperiment(malformed, adapter);
  assert.equal(malformedResult.layouts.fan_out.costEstimate.status, "unknown");
  assert.match(malformedResult.layouts.fan_out.costEstimate.reason, /prefix, context, and suffix/);
});

test("null and malformed cache evidence safely produces unknown cost", async () => {
  const nullInput = { ...structuredClone(DEMO_INPUT), cacheObservations: null } as unknown as ContextShadowInput;
  const nullResult = await runContextShadowExperiment(nullInput, scriptedFakeAdapter);
  assert.equal(nullResult.layouts.fan_out.costEstimate.status, "unknown");

  const adapter = fixedAdapter(DEMO_PROBABILITIES, () => ({ usage: { inputTokens: 100, outputTokens: 2 } }));
  const malformed = measuredCostInput();
  const rows = malformed.cacheObservations!.byLayout!.fan_out!.baselineSegments as unknown as unknown[];
  rows[0] = { segment: ["prefix"], uncachedTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0 };
  const malformedResult = await runContextShadowExperiment(malformed, adapter);
  assert.equal(malformedResult.layouts.fan_out.costEstimate.status, "unknown");
  assert.match(malformedResult.layouts.fan_out.costEstimate.reason, /prefix, context, and suffix/);
  assert.equal(malformedResult.layouts.per_chunk.costEstimate.status, "estimated");

  const threeRowCases: Array<(rows: Array<Record<string, unknown>>) => void> = [
    rows => { rows[1]!.segment = "prefix"; },
    rows => { rows[1]!.cacheReadTokens = -1; },
    rows => { rows[2]!.cacheWriteTokens = 2.5; },
  ];
  for (const mutate of threeRowCases) {
    const input = measuredCostInput();
    const segments = input.cacheObservations!.byLayout!.fan_out!.baselineSegments as unknown as Array<Record<string, unknown>>;
    mutate(segments);
    assert.equal(segments.length, 3);
    const result = await runContextShadowExperiment(input, adapter);
    assert.equal(result.layouts.fan_out.status, "complete");
    assert.equal(result.layouts.fan_out.costEstimate.status, "unknown");
    assert.match(result.layouts.fan_out.costEstimate.reason, /prefix, context, and suffix/);
  }
});

test("scripted evidence does not read inherited object properties for chunk ids", async () => {
  const input: ContextShadowInput = {
    task: "Synthetic prototype-shaped identifier check.",
    chunks: [{ id: "constructor", text: "Synthetic content.", relevant: false }],
  };
  const result = await runContextShadowExperiment(input, scriptedFakeAdapter);
  assert.equal(result.layouts.fan_out.status, "complete");
  assert.equal(result.layouts.fan_out.evidence[0]!.probability, 0.5);
});

test("missing nested prices, missing counterfactuals, and overflowing arithmetic stay unknown", async () => {
  const missingPrices = Object.assign(structuredClone(DEMO_INPUT), {
    cacheObservations: {
      assumptions: { asOf: "2026-09-22", source: "Synthetic assumption", proposerModel: "synthetic" },
    },
  }) as ContextShadowInput;
  const missingCounterfactual = measuredCostInput();
  Object.assign(missingCounterfactual.cacheObservations!.byLayout!.fan_out!, { counterfactual: null });
  const overflowing = measuredCostInput();
  overflowing.cacheObservations!.assumptions!.proposer.inputUsdPerMillion = Number.MAX_VALUE;
  const adapter = fixedAdapter(
    { timeout_config: 0.94, timeout_caller: 0.68, button_styles: 0.08 },
    () => ({ usage: { inputTokens: 100, outputTokens: 2 } }),
  );
  for (const input of [missingPrices, missingCounterfactual, overflowing]) {
    const result = await runContextShadowExperiment(input, adapter);
    assert.equal(result.layouts.fan_out.status, "complete", "invalid cost metadata does not invalidate relevance evidence");
    assert.equal(result.layouts.fan_out.costEstimate.status, "unknown");
    assert.equal(result.layouts.fan_out.costEstimate.netSavingsUsd, null);
  }
});

test("pre-aborted turns make no adapter calls and report request sizes as planned", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const adapter: ScoringAdapter = {
    kind: "scripted_fake",
    async score(call) {
      calls += 1;
      return responseFor(call, {});
    },
  };
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), adapter, { signal: controller.signal });
  assert.equal(calls, 0);
  assert.equal(result.layouts.fan_out.metrics.plannedRequestCount, 1);
  assert.equal(result.layouts.per_chunk.metrics.plannedRequestCount, DEMO_INPUT.chunks.length);
  assert.deepEqual(result.layouts.fan_out.proposedDropIds, []);
  assert.equal(result.layouts.fan_out.status, "unavailable");
  assert.deepEqual(result.layouts.fan_out.failures, [{ requestId: "fan_out:all", code: "cancelled" }]);
  assert.deepEqual(result.layouts.per_chunk.failures, DEMO_INPUT.chunks.map(chunk => ({ requestId: `per_chunk:${chunk.id}`, code: "cancelled" })));
  const section = markdownSection(renderReport(result, "markdown"), "### One request per chunk (per_chunk)");
  assert.ok(section.includes("\nClassifications from an incomplete turn are not drop recommendations; every chunk is retained.\n"));
});

test("duplicate chunk ids are rejected instead of aliasing evidence", async () => {
  const input = structuredClone(DEMO_INPUT);
  input.chunks[1]!.id = input.chunks[0]!.id;
  await assert.rejects(runContextShadowExperiment(input, scriptedFakeAdapter), /Duplicate chunk id/);
});

test("JSON and Markdown render the same versioned artifact and task text cannot inject report sections", async () => {
  const input = structuredClone(DEMO_INPUT);
  input.task = "Synthetic task\n## forged heading\n```json\nnot an artifact\n===";
  const artifact = await runContextShadowExperiment(input, scriptedFakeAdapter);
  const json = renderReport(artifact, "json");
  const markdown = renderReport(artifact, "markdown");
  assert.deepEqual(JSON.parse(json), artifact);
  const opening = markdown.match(/^(`{3,})json$/m);
  assert.ok(opening);
  const fence = opening[1]!;
  const openingIndex = markdown.indexOf(`${fence}json\n`);
  const contentStart = openingIndex + fence.length + "json\n".length;
  const closingIndex = markdown.indexOf(`\n${fence}\n`, contentStart);
  assert.notEqual(closingIndex, -1);
  assert.deepEqual(JSON.parse(markdown.slice(contentStart, closingIndex)), artifact);
  assert.equal((markdown.match(/^`{3,}json$/gm) ?? []).length, 1);
  assert.equal(markdown.includes("\n## forged heading"), false);
  assert.ok(markdown.includes(String.raw`\#\# forged heading`));
  assert.ok(markdown.includes(`Model:** \`${JEV_MODEL}\``));
  assert.doesNotMatch(markdown, /^=+$/m);
});

test("CLI format options are closed and default to JSON", () => {
  assert.equal(parseReportFormat([]), "json");
  assert.equal(parseReportFormat(["--format", "markdown"]), "markdown");
  assert.equal(parseReportFormat(["--", "--format", "markdown"]), "markdown");
  assert.equal(parseReportFormat(["--"]), "json");
  assert.throws(() => parseReportFormat(["--live"]), /Unsupported option/);
  assert.throws(() => parseReportFormat(["--format", "live"]), /Usage:/);
});

test("recall drops below 1 when a relevant chunk scores under the drop threshold", async () => {
  const input: ContextShadowInput = {
    task: "Synthetic recall check.",
    chunks: [
      { id: "relevant_high", text: "Synthetic relevant chunk A.", relevant: true },
      { id: "relevant_low", text: "Synthetic relevant chunk B.", relevant: true },
      { id: "unrelated", text: "Synthetic unrelated chunk.", relevant: false },
    ],
  };
  const result = await runContextShadowExperiment(input, fixedAdapter({ relevant_high: 0.9, relevant_low: 0.1, unrelated: 0.05 }));
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.equal(result.layouts[layout].status, "complete");
    assert.equal(result.layouts[layout].relevanceRecall, 0.5);
    assert.deepEqual(result.layouts[layout].proposedDropIds, ["relevant_low", "unrelated"]);
    assert.deepEqual(result.layouts[layout].proposedKeepIds, ["relevant_high"]);
  }
});

test("cost stays unknown when counterfactual kept ids do not match this turn", async () => {
  const input = measuredCostInput();
  input.cacheObservations!.byLayout!.fan_out!.counterfactual.keptChunkIds = ["timeout_config"];
  const result = await runContextShadowExperiment(
    input,
    fixedAdapter(DEMO_PROBABILITIES, () => ({ usage: { inputTokens: 100, outputTokens: 2 } })),
  );
  assert.deepEqual(result.layouts.fan_out.proposedDropIds, ["button_styles"]);
  assert.equal(result.layouts.fan_out.costEstimate.status, "unknown");
  assert.match(result.layouts.fan_out.costEstimate.reason, /exact keep\/drop sets/);
  assert.equal(result.layouts.per_chunk.costEstimate.status, "estimated");
});

test("cost stays unknown unless every scoring request reports token usage", async () => {
  const partial = await runContextShadowExperiment(
    measuredCostInput(),
    fixedAdapter(DEMO_PROBABILITIES, call =>
      call.requestId === "per_chunk:button_styles" ? {} : { usage: { inputTokens: 50, outputTokens: 2 } }),
  );
  assert.equal(partial.layouts.per_chunk.status, "complete");
  assert.equal(partial.layouts.per_chunk.costEstimate.status, "unknown");
  assert.match(partial.layouts.per_chunk.costEstimate.reason, /token observations are incomplete/);
  assert.equal(partial.layouts.fan_out.costEstimate.status, "estimated");

  const none = await runContextShadowExperiment(measuredCostInput(), fixedAdapter(DEMO_PROBABILITIES));
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.equal(none.layouts[layout].status, "complete");
    assert.equal(none.layouts[layout].costEstimate.status, "unknown");
    assert.match(none.layouts[layout].costEstimate.reason, /token observations are incomplete/);
  }
});

test("a non-abort adapter error marks one request and later requests are still sent", async () => {
  const sent: string[] = [];
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) {
      sent.push(call.requestId);
      if (call.requestId === "per_chunk:timeout_caller") throw new Error("synthetic adapter failure");
      return scriptedFakeAdapter.score(call);
    },
  });
  assert.deepEqual(sent, ["fan_out:all", "per_chunk:timeout_config", "per_chunk:timeout_caller", "per_chunk:button_styles"]);
  assert.equal(result.layouts.per_chunk.status, "unavailable");
  assert.deepEqual(result.layouts.per_chunk.failures, [{ requestId: "per_chunk:timeout_caller", code: "adapter_error" }]);
  assert.deepEqual(result.layouts.per_chunk.proposedDropIds, []);
  assert.deepEqual(result.layouts.per_chunk.evidence.map(row => row.probability), [0.94, null, 0.08]);
  assert.equal(result.layouts.fan_out.status, "complete");
  assert.deepEqual(result.layouts.fan_out.failures, []);
});

test("nested cost evidence is snapshotted before the first await", async () => {
  const adapterFor = (hold: boolean) => {
    let release: ((value: unknown) => void) | undefined;
    let started: (() => void) | undefined;
    const didStart = new Promise<void>(resolve => { started = resolve; });
    const adapter: ScoringAdapter = {
      kind: "scripted_fake",
      score(call) {
        const response = responseFor(call, DEMO_PROBABILITIES, { usage: { inputTokens: call.layout === "fan_out" ? 100 : 50, outputTokens: 2 } });
        if (hold && call.layout === "fan_out") {
          started!();
          return new Promise(resolve => { release = () => resolve(response); });
        }
        return Promise.resolve(response);
      },
    };
    return { adapter, didStart, release: () => release!(undefined) };
  };
  const reference = await runContextShadowExperiment(measuredCostInput(), adapterFor(false).adapter);
  assert.equal(reference.layouts.per_chunk.costEstimate.status, "estimated");

  const input = measuredCostInput();
  const original = structuredClone(input);
  const held = adapterFor(true);
  const pending = runContextShadowExperiment(input, held.adapter);
  await held.didStart;
  const perChunk = input.cacheObservations!.byLayout!.per_chunk!;
  perChunk.baselineSegments[1]!.uncachedTokens = 999_999;
  perChunk.baselineSegments[0]!.cacheReadTokens = 7;
  input.cacheObservations!.assumptions!.proposer.inputUsdPerMillion = 1_000;
  held.release();
  const artifact = await pending;
  assert.deepEqual(artifact.input, original);
  assert.deepEqual(artifact.layouts.per_chunk.costEstimate, reference.layouts.per_chunk.costEstimate);
  assert.deepEqual(artifact.layouts.fan_out.costEstimate, reference.layouts.fan_out.costEstimate);
  assert.notEqual(artifact.input.cacheObservations, input.cacheObservations);
});

test("non-finite, negative, and non-number probabilities are malformed", async () => {
  for (const value of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, "0.5"]) {
    const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
      kind: "scripted_fake",
      async score(call) {
        return {
          source: "scripted_fake",
          model: JEV_MODEL,
          answers: Object.fromEntries(Object.keys(call.questionToChunkId).map(id => [id, value])),
        };
      },
    });
    for (const layout of ["fan_out", "per_chunk"] as const) {
      assert.equal(result.layouts[layout].status, "unavailable", String(value));
      assert.deepEqual(result.layouts[layout].proposedDropIds, []);
      assert.ok(result.layouts[layout].failures.length > 0);
      assert.ok(result.layouts[layout].failures.every(failure => failure.code === "malformed_response"), String(value));
    }
  }
});

test("an extra answer id beside the expected ids is missing evidence", async () => {
  // One extra id sorts before and one after every expected id, so both the
  // count check and the pairwise id check are needed to reject them.
  for (const extra of ["aa_extra_answer", "zz_extra_answer"]) {
    const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
      kind: "scripted_fake",
      async score(call) {
        const response = responseFor(call, DEMO_PROBABILITIES);
        return { ...response, answers: { ...response.answers, [extra]: 0.5 } };
      },
    });
    for (const layout of ["fan_out", "per_chunk"] as const) {
      assert.equal(result.layouts[layout].status, "unavailable", extra);
      assert.deepEqual(result.layouts[layout].proposedDropIds, []);
      assert.ok(result.layouts[layout].failures.every(failure => failure.code === "missing_evidence"), extra);
    }
  }
});

test("an adapter claiming another kind is never called", async () => {
  let calls = 0;
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "live" as never,
    async score() { calls += 1; return {}; },
  });
  assert.equal(calls, 0);
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.equal(result.layouts[layout].status, "unavailable");
    assert.ok(result.layouts[layout].failures.length > 0);
    assert.ok(result.layouts[layout].failures.every(failure => failure.code === "unsupported_provenance"));
  }
  assert.equal(result.layouts.per_chunk.failures.length, DEMO_INPUT.chunks.length);
  assert.deepEqual(result.provenance, { label: "synthetic demonstration", adapter: "scripted_fake", live: false });
});

test("an abort in the same tick as starting the run sends no adapter call", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) { calls += 1; return scriptedFakeAdapter.score(call); },
  }, { signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(calls, 0);
  assert.deepEqual(result.layouts.fan_out.failures, [{ requestId: "fan_out:all", code: "cancelled" }]);
  assert.deepEqual(result.layouts.per_chunk.failures, DEMO_INPUT.chunks.map(chunk => ({ requestId: `per_chunk:${chunk.id}`, code: "cancelled" })));
});

test("an abort just after the first per-chunk response cancels each per-chunk id once", async () => {
  const controller = new AbortController();
  const sent: string[] = [];
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) {
      sent.push(call.requestId);
      const response = await scriptedFakeAdapter.score(call);
      if (call.requestId === "per_chunk:timeout_config") {
        queueMicrotask(() => queueMicrotask(() => controller.abort()));
      }
      return response;
    },
  }, { signal: controller.signal });
  assert.deepEqual(sent, ["fan_out:all", "per_chunk:timeout_config"]);
  assert.equal(result.layouts.fan_out.status, "complete");
  const failures = result.layouts.per_chunk.failures;
  assert.deepEqual(failures, DEMO_INPUT.chunks.map(chunk => ({ requestId: `per_chunk:${chunk.id}`, code: "cancelled" })));
  assert.equal(new Set(failures.map(failure => failure.requestId)).size, failures.length);
  assert.deepEqual(result.layouts.per_chunk.proposedDropIds, []);
});

test("scoring calls are frozen so an adapter cannot rewrite bookkeeping or request bodies", async () => {
  const mutationErrors: boolean[] = [];
  const tryMutate = (mutate: () => void) => {
    try { mutate(); mutationErrors.push(false); } catch (error) { mutationErrors.push(error instanceof TypeError); }
  };
  const mutated = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) {
      const firstQuestion = Object.keys(call.questionToChunkId)[0]!;
      tryMutate(() => { (call.questionToChunkId as Record<string, string>)[firstQuestion] = "button_styles"; });
      tryMutate(() => { (call.questionToChunkId as Record<string, string>).injected = "timeout_config"; });
      tryMutate(() => { (call.body as { model: string }).model = "jev-latest"; });
      tryMutate(() => { call.body.state.task = "mutated task"; });
      tryMutate(() => { delete call.body.questions[firstQuestion]; });
      return scriptedFakeAdapter.score(call);
    },
  });
  assert.equal(mutationErrors.length, 5 * (1 + DEMO_INPUT.chunks.length));
  assert.ok(mutationErrors.every(Boolean));
  const untouched = await runContextShadowExperiment(structuredClone(DEMO_INPUT), scriptedFakeAdapter);
  for (const layout of ["fan_out", "per_chunk"] as const) {
    assert.deepEqual(mutated.layouts[layout].evidence, untouched.layouts[layout].evidence);
    assert.equal(mutated.layouts[layout].metrics.plannedRequestBytes, untouched.layouts[layout].metrics.plannedRequestBytes);
  }
});

test("aggregate cached tokens that are not a token count are omitted, not aliased", async () => {
  const aggregate = { tokens: 1200 };
  for (const value of [aggregate, Number.NaN, 1200n] as unknown[]) {
    const input: ContextShadowInput = {
      ...structuredClone(DEMO_INPUT),
      cacheObservations: { aggregateCachedInputTokens: value as number },
    };
    const artifact = await runContextShadowExperiment(input, scriptedFakeAdapter);
    assert.notEqual(artifact.input.cacheObservations, input.cacheObservations);
    assert.equal(Object.hasOwn(artifact.input.cacheObservations!, "aggregateCachedInputTokens"), false);
    assert.deepEqual(JSON.parse(renderReport(artifact, "json")), artifact);
    assert.ok(renderReport(artifact, "markdown").includes("## Versioned JSON artifact"));
  }
});

test("functions and BigInts in cost evidence make cost unknown without rejecting the run", async () => {
  const cases: Array<{ mutate: (input: ContextShadowInput) => void; unknown: Array<"fan_out" | "per_chunk"> }> = [
    { mutate: input => { (input.cacheObservations!.assumptions!.proposer as Record<string, unknown>).inputUsdPerMillion = 2n; }, unknown: ["fan_out", "per_chunk"] },
    { mutate: input => { (input.cacheObservations!.assumptions!.jev as Record<string, unknown>).outputUsdPerMillion = () => 0.5; }, unknown: ["fan_out", "per_chunk"] },
    { mutate: input => { (input.cacheObservations!.byLayout!.per_chunk!.baselineSegments[0] as unknown as Record<string, unknown>).uncachedTokens = 10n; }, unknown: ["per_chunk"] },
    { mutate: input => { (input.cacheObservations!.byLayout!.fan_out!.counterfactual.segments[1] as unknown as Record<string, unknown>).cacheReadTokens = () => 30; }, unknown: ["fan_out"] },
  ];
  const adapter = fixedAdapter(DEMO_PROBABILITIES, () => ({ usage: { inputTokens: 100, outputTokens: 2 } }));
  for (const { mutate, unknown } of cases) {
    const input = measuredCostInput();
    mutate(input);
    const artifact = await runContextShadowExperiment(input, adapter);
    for (const layout of ["fan_out", "per_chunk"] as const) {
      assert.equal(artifact.layouts[layout].status, "complete");
      assert.ok(artifact.layouts[layout].evidence.every(row => row.probability !== null));
      assert.equal(artifact.layouts[layout].costEstimate.status, unknown.includes(layout) ? "unknown" : "estimated");
    }
    assert.deepEqual(JSON.parse(renderReport(artifact, "json")), artifact);
    assert.ok(renderReport(artifact, "markdown").includes("## Versioned JSON artifact"));
  }
});

test("sparse chunk arrays are rejected at the hole", async () => {
  const input = structuredClone(DEMO_INPUT);
  // eslint-disable-next-line no-sparse-arrays
  input.chunks = [, ...input.chunks.slice(1)] as ContextShadowInput["chunks"];
  await assert.rejects(runContextShadowExperiment(input, scriptedFakeAdapter), /Chunk 0 must be an object/);
});

test("chunks are read by index, not through a caller-supplied iterator", async () => {
  const input = structuredClone(DEMO_INPUT);
  Object.defineProperty(input.chunks, Symbol.iterator, {
    value: function* () { yield { id: "injected", text: "Injected chunk.", relevant: false }; },
  });
  const result = await runContextShadowExperiment(input, scriptedFakeAdapter);
  assert.deepEqual(result.input.chunks.map(chunk => chunk.id), ["timeout_config", "timeout_caller", "button_styles"]);

  const empty = structuredClone(DEMO_INPUT);
  Object.defineProperty(empty.chunks, Symbol.iterator, { value: function* () {} });
  const emptied = await runContextShadowExperiment(empty, scriptedFakeAdapter);
  assert.equal(emptied.input.chunks.length, 3);
});

test("the task is read once, so a changing getter cannot bypass validation", async () => {
  const input = structuredClone(DEMO_INPUT);
  let reads = 0;
  Object.defineProperty(input, "task", {
    enumerable: true,
    get: () => (reads++ === 0 ? DEMO_INPUT.task : 42),
  });
  const sent: ScoringCall[] = [];
  const result = await runContextShadowExperiment(input, {
    kind: "scripted_fake",
    async score(call) { sent.push(call); return scriptedFakeAdapter.score(call); },
  });
  assert.equal(reads, 1);
  assert.equal(result.input.task, DEMO_INPUT.task);
  assert.ok(sent.every(call => call.body.state.task === DEMO_INPUT.task));
});

test("baseline counts that differ between request layouts make both costs unknown", async () => {
  for (const field of ["uncachedTokens", "cacheReadTokens", "cacheWriteTokens"] as const) {
    const input = measuredCostInput();
    input.cacheObservations!.byLayout!.per_chunk!.baselineSegments[1]![field] += 7;
    const result = await runContextShadowExperiment(
      input,
      fixedAdapter(DEMO_PROBABILITIES, () => ({ usage: { inputTokens: 100, outputTokens: 2 } })),
    );
    for (const layout of ["fan_out", "per_chunk"] as const) {
      assert.equal(result.layouts[layout].status, "complete", field);
      assert.equal(result.layouts[layout].costEstimate.status, "unknown", field);
      assert.match(result.layouts[layout].costEstimate.reason, /baseline counts differ/, field);
    }
  }
});

test("an unavailable layout's Markdown says its classifications are not drop recommendations", async () => {
  const result = await runContextShadowExperiment(structuredClone(DEMO_INPUT), {
    kind: "scripted_fake",
    async score(call) {
      if (call.requestId === "per_chunk:timeout_caller") throw new Error("synthetic adapter failure");
      return scriptedFakeAdapter.score(call);
    },
  });
  const markdown = renderReport(result, "markdown");
  const line = "Classifications from an incomplete turn are not drop recommendations; every chunk is retained.";
  assert.ok(markdownSection(markdown, "### One request per chunk (per_chunk)").includes(line));
  assert.equal(markdownSection(markdown, "### All chunks in one request (fan_out)").includes(line), false);
  assert.equal(result.layouts.per_chunk.evidence[2]!.classification, "would_drop", "JSON classifications are unchanged");
});
