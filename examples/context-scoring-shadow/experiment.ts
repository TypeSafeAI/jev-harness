import {
  DROP_BELOW,
  JEV_MODEL,
  QUESTION_SET_VERSION,
  RELEVANCE_CRITERIA,
  RELEVANCE_QUESTION,
  RELEVANT_ABOVE,
  REQUEST_LAYOUTS,
  UNTRUSTED_DATA_NOTE,
  type ChunkEvidence,
  type ContextShadowArtifact,
  type ContextShadowInput,
  type CostEstimate,
  type CostEvidence,
  type Failure,
  type LayoutCostObservations,
  type LayoutResult,
  type NoulQuestion,
  type NoulRequestBody,
  type PriceAssumptions,
  type RequestLayout,
  type ScoringAdapter,
  type ScoringCall,
  type ScriptedNoulResponse,
  type SegmentTokenObservation,
} from "./types.js";

const bytes = (value: string) => new TextEncoder().encode(value).length;
const tokenProxy = (byteCount: number) => Math.ceil(byteCount / 4);

interface InputSnapshot {
  task: string;
  chunks: Array<{ id: string; text: string; relevant: boolean }>;
  cacheObservations?: CostEvidence;
}

interface RequestSuccess {
  call: ScoringCall;
  answers: Record<string, number>;
  usage: { inputTokens: number; outputTokens: number } | null;
}

interface RequestFailure {
  failure: Failure;
}

function copyCostEvidence(value: CostEvidence | undefined): CostEvidence | undefined {
  if (value === undefined || value === null) return undefined;
  const record = ownDataRecord(value);
  if (!record) return undefined;
  return {
    ...(record.assumptions === undefined
      ? {}
      : { assumptions: structuredClone(record.assumptions) }),
    ...(record.aggregateCachedInputTokens === undefined
      ? {}
      : { aggregateCachedInputTokens: record.aggregateCachedInputTokens as number }),
    ...(record.byLayout === undefined
      ? {}
      : {
          byLayout: Object.fromEntries(
            REQUEST_LAYOUTS.flatMap(layout => {
              const observations = ownDataRecord(record.byLayout);
              const observation = observations?.[layout];
              return observation === undefined
                ? []
                : [[layout, structuredClone(observation)]];
            }),
          ),
        }),
  } as unknown as CostEvidence;
}

/** Copy only plain task/chunk/label fields synchronously before the first await. */
function snapshotInput(input: ContextShadowInput): InputSnapshot {
  if (!input || typeof input !== "object" || typeof input.task !== "string") {
    throw new TypeError("Context shadow input needs a task string.");
  }
  if (!Array.isArray(input.chunks) || input.chunks.length === 0) {
    throw new TypeError("Context shadow input needs at least one chunk.");
  }
  const seen = new Set<string>();
  const chunks = input.chunks.map((chunk, index) => {
    if (!chunk || typeof chunk !== "object") {
      throw new TypeError(`Chunk ${index} must be an object.`);
    }
    const { id, text, relevant } = chunk;
    if (typeof id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(id)) {
      throw new TypeError(`Chunk ${index} has an invalid id.`);
    }
    if (seen.has(id)) throw new TypeError(`Duplicate chunk id: ${id}.`);
    seen.add(id);
    if (typeof text !== "string" || typeof relevant !== "boolean") {
      throw new TypeError(`Chunk ${id} needs text and a boolean evaluation label.`);
    }
    return { id, text, relevant };
  });
  const cacheObservations = copyCostEvidence(input.cacheObservations);
  return {
    task: input.task,
    chunks,
    ...(cacheObservations === undefined ? {} : { cacheObservations }),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function buildQuestion(instructions: NoulQuestion["instructions"]): NoulQuestion {
  return {
    type: "noul",
    instructions,
    criteria: { true: RELEVANCE_CRITERIA.true, false: RELEVANCE_CRITERIA.false },
  };
}

function buildCalls(
  snapshot: InputSnapshot,
  layout: RequestLayout,
): ScoringCall[] {
  if (layout === "fan_out") {
    const questionToChunkId: Record<string, string> = {};
    const questions: Record<string, NoulQuestion> = {};
    for (const chunk of snapshot.chunks) {
      const questionId = `relevance_${chunk.id}`;
      questionToChunkId[questionId] = chunk.id;
      questions[questionId] = buildQuestion({
        question: RELEVANCE_QUESTION,
        context_chunk: { id: chunk.id, text: chunk.text },
      });
    }
    const body: NoulRequestBody = {
      model: JEV_MODEL,
      state: {
        note: UNTRUSTED_DATA_NOTE,
        task: snapshot.task,
        chunks: snapshot.chunks.map(({ id, text }) => ({ id, text })),
      },
      questions,
    };
    return [
      deepFreeze({
        layout,
        requestId: "fan_out:all",
        questionToChunkId,
        body,
      }),
    ];
  }

  return snapshot.chunks.map(chunk => {
    const questionToChunkId = { is_relevant: chunk.id };
    const body: NoulRequestBody = {
      model: JEV_MODEL,
      state: {
        note: UNTRUSTED_DATA_NOTE,
        task: snapshot.task,
        context_chunk: { id: chunk.id, text: chunk.text },
      },
      questions: { is_relevant: buildQuestion(RELEVANCE_QUESTION) },
    };
    return deepFreeze({
      layout,
      requestId: `per_chunk:${chunk.id}`,
      questionToChunkId,
      body,
    });
  });
}

function ownDataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function validTokenCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseResponse(
  value: unknown,
  call: ScoringCall,
): { ok: true; response: ScriptedNoulResponse } | { ok: false; code: Failure["code"] } {
  const record = ownDataRecord(value);
  if (!record) return { ok: false, code: "malformed_response" };
  if (record.source !== "scripted_fake") {
    return { ok: false, code: "unsupported_provenance" };
  }
  if (record.model !== JEV_MODEL) return { ok: false, code: "wrong_model" };
  const answerRecord = ownDataRecord(record.answers);
  if (!answerRecord) return { ok: false, code: "malformed_response" };
  const expectedIds = Object.keys(call.questionToChunkId).sort();
  const answerIds = Object.keys(answerRecord).sort();
  if (expectedIds.length !== answerIds.length || expectedIds.some((id, i) => id !== answerIds[i])) {
    return { ok: false, code: "missing_evidence" };
  }
  const answers: Record<string, number> = {};
  for (const id of expectedIds) {
    const probability = answerRecord[id];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return { ok: false, code: "malformed_response" };
    }
    answers[id] = probability;
  }

  let usage: ScriptedNoulResponse["usage"];
  if (record.usage !== undefined) {
    const usageRecord = ownDataRecord(record.usage);
    if (
      !usageRecord ||
      !validTokenCount(usageRecord.inputTokens) ||
      !validTokenCount(usageRecord.outputTokens)
    ) {
      return { ok: false, code: "malformed_response" };
    }
    usage = { inputTokens: usageRecord.inputTokens, outputTokens: usageRecord.outputTokens };
  }

  return {
    ok: true,
    response: {
      source: "scripted_fake",
      model: JEV_MODEL,
      answers,
      ...(usage === undefined ? {} : { usage }),
    },
  };
}

function abortError(): Error {
  return new Error("Context scoring cancelled.");
}

async function scoreCall(
  adapter: ScoringAdapter,
  call: ScoringCall,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (signal?.aborted) throw abortError();
  const scoring = Promise.resolve().then(() => adapter.score(call, signal));
  if (!signal) return scoring;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([scoring, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function classify(probability: number): ChunkEvidence["classification"] {
  if (probability < DROP_BELOW) return "would_drop";
  if (probability > RELEVANT_ABOVE) return "relevant_retained";
  return "uncertain_retained";
}

function isExactIdList(actual: unknown, expected: readonly string[]): actual is string[] {
  if (!Array.isArray(actual)) return false;
  const copied = Array.from(actual) as unknown[];
  if (copied.some(id => typeof id !== "string")) return false;
  if (new Set(copied).size !== copied.length || copied.length !== expected.length) return false;
  const sortedActual = copied as string[];
  sortedActual.sort();
  const sortedExpected = [...expected].sort();
  return sortedActual.every((id, index) => id === sortedExpected[index]);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validRates(value: unknown): value is PriceAssumptions {
  const assumptions = ownDataRecord(value);
  if (!assumptions || typeof assumptions.asOf !== "string" || !validDate(assumptions.asOf) ||
      typeof assumptions.source !== "string" || !assumptions.source.trim() ||
      typeof assumptions.proposerModel !== "string" || !assumptions.proposerModel.trim()) return false;
  const proposer = ownDataRecord(assumptions.proposer);
  const jev = ownDataRecord(assumptions.jev);
  if (!proposer || !jev) return false;
  const rates = [
    proposer.inputUsdPerMillion,
    proposer.cacheReadUsdPerMillion,
    proposer.cacheWriteUsdPerMillion,
    jev.inputUsdPerMillion,
    jev.outputUsdPerMillion,
  ];
  return rates.every(rate => typeof rate === "number" && Number.isFinite(rate) && rate >= 0);
}

function validSegments(value: unknown): value is SegmentTokenObservation[] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const seen = new Set<string>();
  for (const row of value) {
    const record = ownDataRecord(row);
  if (
      !record ||
      typeof record.segment !== "string" ||
      !["prefix", "context", "suffix"].includes(record.segment) ||
      seen.has(record.segment) ||
      !validTokenCount(record.uncachedTokens) ||
      !validTokenCount(record.cacheReadTokens) ||
      !validTokenCount(record.cacheWriteTokens)
    ) return false;
    seen.add(record.segment);
  }
  return seen.size === 3 && ["prefix", "context", "suffix"].every(segment => seen.has(segment));
}

function segmentCost(
  rows: readonly SegmentTokenObservation[],
  assumptions: PriceAssumptions,
): number {
  return rows.reduce((total, row) => total +
    (row.uncachedTokens * assumptions.proposer.inputUsdPerMillion +
      row.cacheReadTokens * assumptions.proposer.cacheReadUsdPerMillion +
      row.cacheWriteTokens * assumptions.proposer.cacheWriteUsdPerMillion) / 1_000_000, 0);
}

function unknownCost(reason: string, assumptions: PriceAssumptions | null = null): CostEstimate {
  return {
    status: "unknown",
    reason,
    assumptions,
    baselineProposerUsd: null,
    counterfactualProposerUsd: null,
    scoringUsd: null,
    netSavingsUsd: null,
  };
}

function estimateCost(
  snapshot: InputSnapshot,
  layout: RequestLayout,
  result: Pick<LayoutResult, "status" | "proposedKeepIds" | "proposedDropIds" | "scoreRequestTokenObservations">,
  expectedRequestIds: readonly string[],
): CostEstimate {
  const costEvidence = ownDataRecord(snapshot.cacheObservations);
  if (!costEvidence || !validRates(costEvidence.assumptions)) {
    return unknownCost("dated price assumptions are missing or malformed");
  }
  const assumptions = costEvidence.assumptions;
  const byLayout = ownDataRecord(costEvidence.byLayout);
  const observed = ownDataRecord(byLayout?.[layout]);
  if (!observed) return unknownCost("segment-level baseline and counterfactual observations are missing", assumptions);
  if (result.status !== "complete") return unknownCost("the scoring turn is incomplete", assumptions);
  const counterfactual = ownDataRecord(observed.counterfactual);
  if (!validSegments(observed.baselineSegments) || !counterfactual || !validSegments(counterfactual.segments)) {
    return unknownCost("explicit prefix, context, and suffix uncached/cache-read/cache-write observations are required", assumptions);
  }
  const baselineSegments = observed.baselineSegments;
  const counterfactualSegments = counterfactual.segments as SegmentTokenObservation[];
  const baselineNames = baselineSegments.map(row => row.segment).sort();
  const counterfactualNames = counterfactualSegments.map(row => row.segment).sort();
  if (baselineNames.length !== counterfactualNames.length || baselineNames.some((name, i) => name !== counterfactualNames[i])) {
    return unknownCost("baseline and counterfactual segment sets do not match", assumptions);
  }
  if (!isExactIdList(counterfactual.keptChunkIds, result.proposedKeepIds) ||
      !isExactIdList(counterfactual.droppedChunkIds, result.proposedDropIds)) {
    return unknownCost("counterfactual observations are not bound to this turn's exact keep/drop sets", assumptions);
  }
  const tokenObservations = result.scoreRequestTokenObservations;
  if (
    tokenObservations.length !== expectedRequestIds.length ||
    expectedRequestIds.some(id => !tokenObservations.some(observation => observation.requestId === id))
  ) {
    return unknownCost("scoring request token observations are incomplete for this layout", assumptions);
  }
  const scoringInput = tokenObservations.reduce((sum, observation) => sum + observation.inputTokens, 0);
  const scoringOutput = tokenObservations.reduce((sum, observation) => sum + observation.outputTokens, 0);
  const baselineProposerUsd = segmentCost(baselineSegments, assumptions);
  const counterfactualProposerUsd = segmentCost(counterfactualSegments, assumptions);
  const scoringUsd = (scoringInput * assumptions.jev.inputUsdPerMillion +
    scoringOutput * assumptions.jev.outputUsdPerMillion) / 1_000_000;
  const netSavingsUsd = baselineProposerUsd - counterfactualProposerUsd - scoringUsd;
  if (![baselineProposerUsd, counterfactualProposerUsd, scoringUsd, netSavingsUsd].every(Number.isFinite)) {
    return unknownCost("cost arithmetic exceeded finite numeric range", assumptions);
  }
  return {
    status: "estimated",
    reason: "Illustrative arithmetic from explicitly supplied segment and request observations; synthetic output is not a live measurement.",
    assumptions,
    baselineProposerUsd,
    counterfactualProposerUsd,
    scoringUsd,
    netSavingsUsd,
  };
}

function buildLayoutResult(
  snapshot: InputSnapshot,
  layout: RequestLayout,
  calls: readonly ScoringCall[],
  successes: readonly RequestSuccess[],
  failures: readonly Failure[],
): LayoutResult {
  const probabilities = new Map<string, number>();
  const scoreRequestTokenObservations: LayoutResult["scoreRequestTokenObservations"] = [];
  for (const success of successes) {
    for (const [questionId, probability] of Object.entries(success.answers)) {
      probabilities.set(success.call.questionToChunkId[questionId]!, probability);
    }
    if (success.usage) {
      scoreRequestTokenObservations.push({ requestId: success.call.requestId, ...success.usage });
    }
  }
  const evidence = snapshot.chunks.map(chunk => {
    const probability = probabilities.get(chunk.id);
    return probability === undefined
      ? { chunkId: chunk.id, probability: null, classification: "unavailable" as const }
      : { chunkId: chunk.id, probability, classification: classify(probability) };
  });
  const complete = failures.length === 0 && evidence.every(row => row.probability !== null);
  const proposedDropIds = complete
    ? evidence.filter(row => row.classification === "would_drop").map(row => row.chunkId)
    : [];
  const proposedKeepIds = complete
    ? evidence.filter(row => row.classification !== "would_drop").map(row => row.chunkId)
    : snapshot.chunks.map(chunk => chunk.id);
  const uncertainIds = evidence
    .filter(row => row.classification === "uncertain_retained")
    .map(row => row.chunkId);
  const relevantIds = snapshot.chunks.filter(chunk => chunk.relevant).map(chunk => chunk.id);
  const relevanceRecall = complete && relevantIds.length > 0
    ? relevantIds.filter(id => proposedKeepIds.includes(id)).length / relevantIds.length
    : null;
  const originalContextBytes = bytes(snapshot.chunks.map(chunk => chunk.text).join("\n"));
  const proposedChunks = snapshot.chunks.filter(chunk => proposedKeepIds.includes(chunk.id));
  const proposedContextBytes = bytes(proposedChunks.map(chunk => chunk.text).join("\n"));
  const requestBytes = calls.reduce((sum, call) => sum + bytes(JSON.stringify(call.body)), 0);
  const requestTokenProxy = calls.reduce((sum, call) => sum + tokenProxy(bytes(JSON.stringify(call.body))), 0);
  const preliminary: Omit<LayoutResult, "costEstimate"> = {
    layout,
    status: complete ? "complete" : "unavailable",
    failures: [...failures],
    evidence,
    proposedKeepIds,
    proposedDropIds,
    uncertainIds,
    relevanceRecall,
    scoreRequestTokenObservations,
    metrics: {
      originalContextBytes,
      proposedContextBytes,
      originalContextTokenProxy: tokenProxy(originalContextBytes),
      proposedContextTokenProxy: tokenProxy(proposedContextBytes),
      plannedRequestCount: calls.length,
      plannedRequestBytes: requestBytes,
      plannedRequestTokenProxy: requestTokenProxy,
    },
  };
  const expectedRequestIds = calls.map(call => call.requestId);
  return {
    ...preliminary,
    costEstimate: estimateCost(snapshot, layout, preliminary, expectedRequestIds),
  };
}

function unavailableAdapterResult(
  snapshot: InputSnapshot,
  layout: RequestLayout,
  calls: readonly ScoringCall[],
  code: Failure["code"],
): LayoutResult {
  return buildLayoutResult(snapshot, layout, calls, [], calls.map(call => ({ requestId: call.requestId, code })));
}

async function runLayout(
  snapshot: InputSnapshot,
  adapter: ScoringAdapter,
  layout: RequestLayout,
  signal: AbortSignal | undefined,
): Promise<LayoutResult> {
  const calls = buildCalls(snapshot, layout);
  if (adapter?.kind !== "scripted_fake" || typeof adapter.score !== "function") {
    return unavailableAdapterResult(snapshot, layout, calls, "unsupported_provenance");
  }
  const successes: RequestSuccess[] = [];
  const failures: Failure[] = [];
  for (const call of calls) {
    if (signal?.aborted) {
      failures.push({ requestId: call.requestId, code: "cancelled" });
      for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
        failures.push({ requestId: remaining.requestId, code: "cancelled" });
      }
      break;
    }
    try {
      const raw = await scoreCall(adapter, call, signal);
      if (signal?.aborted) {
        failures.push({ requestId: call.requestId, code: "cancelled" });
        for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
          failures.push({ requestId: remaining.requestId, code: "cancelled" });
        }
        break;
      }
      const parsed = parseResponse(raw, call);
      if (!parsed.ok) failures.push({ requestId: call.requestId, code: parsed.code });
      else successes.push({ call, answers: parsed.response.answers, usage: parsed.response.usage ?? null });
    } catch {
      failures.push({ requestId: call.requestId, code: signal?.aborted ? "cancelled" : "adapter_error" });
      if (signal?.aborted) {
        for (const remaining of calls.slice(calls.indexOf(call) + 1)) {
          failures.push({ requestId: remaining.requestId, code: "cancelled" });
        }
        break;
      }
    }
  }
  return buildLayoutResult(snapshot, layout, calls, successes, failures);
}

/** Offline shadow comparison. It never returns a context for a caller to install. */
export async function runContextShadowExperiment(
  input: ContextShadowInput,
  adapter: ScoringAdapter,
  options: { signal?: AbortSignal } = {},
): Promise<ContextShadowArtifact> {
  const signal = options.signal;
  const snapshot = snapshotInput(input);
  // Both request layouts are built from the same immutable-by-ownership snapshot.
  const layouts = {} as Record<RequestLayout, LayoutResult>;
  for (const layout of REQUEST_LAYOUTS) {
    layouts[layout] = await runLayout(snapshot, adapter, layout, signal);
  }
  return {
    schemaVersion: 1,
    experimentVersion: 1,
    model: JEV_MODEL,
    questionSetVersion: QUESTION_SET_VERSION,
    provenance: { label: "synthetic demonstration", adapter: "scripted_fake", live: false },
    thresholds: { dropBelow: DROP_BELOW, relevantAbove: RELEVANT_ABOVE },
    input: snapshot,
    layouts,
    originalContextPreserved: true,
  };
}
