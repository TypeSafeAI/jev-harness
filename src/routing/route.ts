import { JEV_MODEL } from "../contract/types.js";
import { CLARIFICATION_ID, ROUTING_QUESTION_SET_VERSION, ROUTING_UNTRUSTED_DATA_NOTE, createCatalog, freeze, isRecord } from "./catalog.js";
import type { Catalog, RoutingEvidence, RoutingInput, RoutingPolicy, RoutingReceipt, RoutingRequest, ToolRouter } from "./types.js";

const unit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
function parseEvidence(raw: unknown, ids: readonly string[]): RoutingEvidence | null {
  if (!isRecord(raw) || raw.model !== JEV_MODEL || typeof raw.choice !== "string" || !ids.includes(raw.choice) || !unit(raw.confidence) || !isRecord(raw.probabilities)) return null;
  const scores = raw.probabilities;
  if (Object.keys(scores).length !== ids.length || ids.some(id => !Object.hasOwn(scores, id) || !unit(scores[id]))) return null;
  const probabilities = Object.fromEntries(ids.map(id => [id, scores[id] as number]));
  if (Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) > 1e-6) return null;
  if (probabilities[raw.choice] !== Math.max(...Object.values(probabilities))) return null;
  return { model: JEV_MODEL, choice: raw.choice, confidence: raw.confidence, probabilities };
}
function snapshotPolicy(policy: RoutingPolicy): RoutingPolicy {
  if (!Number.isInteger(policy.topK) || policy.topK < 1 || policy.topK > 254 || !unit(policy.confidenceFloor) || !unit(policy.probabilityFloor) || !unit(policy.relevanceWindow) || !Number.isFinite(policy.maxCostUnits) || policy.maxCostUnits < 0)
    throw Error("Invalid routing policy limits.");
  return freeze({ topK: policy.topK, confidenceFloor: policy.confidenceFloor, probabilityFloor: policy.probabilityFloor, relevanceWindow: policy.relevanceWindow, maxCostUnits: policy.maxCostUnits });
}

/** One evidence request; no loop, provider client, clock or tool execution. */
export async function routeTools(catalog: Catalog, input: RoutingInput, policy: RoutingPolicy, router: ToolRouter, signal?: AbortSignal): Promise<RoutingReceipt> {
  const snapshot = createCatalog(catalog);
  const limits = snapshotPolicy(policy);
  if (typeof input.intent !== "string" || !input.intent.trim() || input.intent.length > 16_000) throw Error("Intent must contain 1–16000 characters.");
  if (!Array.isArray(input.availableIds) || new Set(input.availableIds).size !== input.availableIds.length || input.availableIds.some(id => !snapshot.some(tool => tool.id === id)))
    throw Error("Availability must name unique catalog ids.");
  if (router.source !== "mock" && router.source !== "jev") throw Error("Invalid routing source.");
  const source = router.source;
  const available = snapshot.filter(tool => input.availableIds.includes(tool.id));
  const request: RoutingRequest = freeze({ model: JEV_MODEL, questionSetVersion: ROUTING_QUESTION_SET_VERSION, intent: input.intent,
    untrustedDataNote: ROUTING_UNTRUSTED_DATA_NOTE,
    options: [...available.map(({ id, kind, description }) => ({ id, kind, description })), { id: CLARIFICATION_ID, kind: "fallback" as const, description: "Ask for clarification when the task is ambiguous or none of the available tools fits." }] });
  const finish = (outcome: RoutingReceipt["outcome"], reason: string, evidence: RoutingEvidence | null = null, selectedIds: string[] = []): RoutingReceipt =>
    freeze({ schemaVersion: 1, catalog: snapshot, request, policy: limits, source, evidence, outcome, selectedIds, reason, execution: { applied: false } });
  if (signal?.aborted) return finish("unavailable", "Routing cancelled; no tools selected.");
  if (!available.length) return finish("no_match", "No tools are available in the host snapshot.");
  let evidence: RoutingEvidence | null;
  try {
    evidence = parseEvidence(await router.review(request, signal), request.options.map(option => option.id));
  } catch {
    // Provider error text may contain credentials or user data. Never echo it.
    return finish("unavailable", "Routing adapter failed; no tools selected.");
  }
  if (signal?.aborted) return finish("unavailable", "Routing cancelled; no tools selected.");
  if (!evidence) return finish("unavailable", "Routing evidence was missing, malformed, outside the closed set, or from a different model.");
  if (evidence.choice === CLARIFICATION_ID || evidence.probabilities[CLARIFICATION_ID] === Math.max(...Object.values(evidence.probabilities)))
    return finish("needs_clarification", "The evidence includes clarification as a leading option. Ask before selecting tools.", evidence);
  if (evidence.confidence < limits.confidenceFloor)
    return finish("needs_clarification", "Choice confidence is below the host's configured floor; ask before selecting tools.", evidence);
  const best = Math.max(...available.map(tool => evidence.probabilities[tool.id]!));
  const candidates = available.filter(tool => evidence.probabilities[tool.id]! >= limits.probabilityFloor && best - evidence.probabilities[tool.id]! <= limits.relevanceWindow + Number.EPSILON && tool.estimatedCostUnits <= limits.maxCostUnits);
  candidates.sort((a, b) => a.estimatedCostUnits - b.estimatedCostUnits || evidence.probabilities[b.id]! - evidence.probabilities[a.id]! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selectedIds = candidates.slice(0, limits.topK).map(tool => tool.id);
  return selectedIds.length
    ? finish("selected", "Lowest estimated cost within the relevance window, probability floor and per-tool budget. Routing evidence, not authorization; nothing executed.", evidence, selectedIds)
    : finish("no_match", "No candidate meets the probability, relevance and per-tool cost limits.", evidence);
}
