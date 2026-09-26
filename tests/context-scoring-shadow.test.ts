import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_INPUT, scriptedFakeAdapter } from "../examples/context-scoring-shadow/demo.js";
import { runContextShadowExperiment } from "../examples/context-scoring-shadow/experiment.js";
import { parseReportFormat, renderReport } from "../examples/context-scoring-shadow/report.js";
import { JEV_MODEL, UNTRUSTED_DATA_NOTE, type ContextShadowInput, type ScoringAdapter, type ScoringCall } from "../examples/context-scoring-shadow/types.js";

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
    chunks: DEMO_INPUT.chunks.map(({ id, text }) => ({ id, text })),
  });
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
      jev: { inputUsdPerMillion: 0.042, outputUsdPerMillion: 0 },
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
  assert.ok(Math.abs(fanOutCost.scoringUsd! - 0.0000042) < 1e-15);
  assert.ok(Math.abs(fanOutCost.netSavingsUsd! - 0.0001398) < 1e-15);
  const perChunkCost = withObservations.layouts.per_chunk.costEstimate;
  assert.ok(Math.abs(perChunkCost.baselineProposerUsd! - 0.000294) < 1e-15);
  assert.ok(Math.abs(perChunkCost.counterfactualProposerUsd! - 0.00015) < 1e-15);
  assert.ok(Math.abs(perChunkCost.scoringUsd! - 0.0000063) < 1e-15);
  assert.ok(Math.abs(perChunkCost.netSavingsUsd! - 0.0001377) < 1e-15);
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

  const malformed = measuredCostInput();
  const rows = malformed.cacheObservations!.byLayout!.fan_out!.baselineSegments as unknown as unknown[];
  rows[0] = { segment: ["prefix"], uncachedTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0 };
  const malformedResult = await runContextShadowExperiment(malformed, scriptedFakeAdapter);
  assert.equal(malformedResult.layouts.fan_out.costEstimate.status, "unknown");
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
});

test("duplicate chunk ids are rejected instead of aliasing evidence", async () => {
  const input = structuredClone(DEMO_INPUT);
  input.chunks[1]!.id = input.chunks[0]!.id;
  await assert.rejects(runContextShadowExperiment(input, scriptedFakeAdapter), /Duplicate chunk id/);
});

test("JSON and Markdown render the same versioned artifact and task text cannot inject report sections", async () => {
  const input = structuredClone(DEMO_INPUT);
  input.task = "Synthetic task\n## forged heading\n```json\nnot an artifact";
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
});

test("CLI format options are closed and default to JSON", () => {
  assert.equal(parseReportFormat([]), "json");
  assert.equal(parseReportFormat(["--format", "markdown"]), "markdown");
  assert.throws(() => parseReportFormat(["--live"]), /Unsupported option/);
  assert.throws(() => parseReportFormat(["--format", "live"]), /Usage:/);
});
