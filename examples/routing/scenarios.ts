import { createCatalog, type RoutingPolicy, type RoutingReceipt, type ToolRouter } from "../../src/routing/index.js";

export const DEMO_CATALOG = createCatalog([
  { id: "read_file", kind: "tool", description: "Read one named file in a synthetic workspace without changing it.", estimatedCostUnits: 1,
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative path to the single synthetic file to inspect; no absolute paths or parent traversal." } }, required: ["path"], additionalProperties: false } },
  { id: "propose_patch", kind: "tool", description: "Record a proposed single-file edit for a concrete defect; never apply it.", estimatedCostUnits: 3,
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative synthetic file path." }, patch: { type: "string", description: "Single-file unified diff describing a pending proposal only." }, rationale: { type: "string", description: "How the proposed edit addresses the requested defect." } }, required: ["path", "patch", "rationale"], additionalProperties: false } },
  { id: "inspect_agent", kind: "subagent", description: "A specialist descriptor for inspecting synthetic files and explaining a defect; no agent is launched.", estimatedCostUnits: 9,
    inputSchema: { type: "object", properties: { task: { type: "string", description: "A bounded inspection task for the synthetic specialist." }, path: { type: "string", description: "Synthetic target path for inspection." }, includeExplanation: { type: "boolean", description: "Whether to include a detailed explanation in a future host implementation." } }, required: ["task", "path"], additionalProperties: false } },
]);
export const DEMO_POLICY: RoutingPolicy = { topK: 1, confidenceFloor: 0.7, probabilityFloor: 0.2, relevanceWindow: 0.1, maxCostUnits: 10 };
export interface RoutingScenario {
  id: string;
  title: string;
  intent: string;
  /** Bookkeeping and scripted evidence; neither appears in the request. */
  acceptableIds: readonly string[];
  expectedOutcome: RoutingReceipt["outcome"];
  weights: Record<string, number>;
  confidence: number;
  /** Scripted alternatives are independent of evaluation labels. */
  mockAlternatives?: Record<string, string>;
  failure?: "unavailable" | "malformed";
}
export const SCENARIOS: readonly RoutingScenario[] = [
  { id: "read", mockAlternatives: { read_file: "inspect_agent", inspect_agent: "read_file" }, title: "Read a file", intent: "Read src/sum.ts in the synthetic workspace.", acceptableIds: ["read_file", "inspect_agent"], expectedOutcome: "selected", weights: { read_file: 0.46, inspect_agent: 0.5, propose_patch: 0.01, needs_clarification: 0.03 }, confidence: 0.9 },
  { id: "patch", title: "Propose an edit", intent: "Propose a patch to fix the off-by-one loop in synthetic src/sum.ts.", acceptableIds: ["propose_patch"], expectedOutcome: "selected", weights: { read_file: 0.03, inspect_agent: 0.04, propose_patch: 0.9, needs_clarification: 0.03 }, confidence: 0.9 },
  { id: "inspect", title: "Ask a specialist", intent: "Explain the interaction of both helpers in synthetic src/sum.ts.", acceptableIds: ["inspect_agent"], expectedOutcome: "selected", weights: { read_file: 0.1, inspect_agent: 0.84, propose_patch: 0.03, needs_clarification: 0.03 }, confidence: 0.85 },
  { id: "ambiguous", title: "Clarify the task", intent: "Clean up the helper.", acceptableIds: [], expectedOutcome: "needs_clarification", weights: { needs_clarification: 1 }, confidence: 0.95 },
  { id: "uncertain", title: "Low confidence", intent: "Look at the example and maybe change it.", acceptableIds: [], expectedOutcome: "needs_clarification", weights: { read_file: 0.4, inspect_agent: 0.3, propose_patch: 0.2, needs_clarification: 0.1 }, confidence: 0.3 },
  { id: "outage", title: "Adapter unavailable", intent: "Inspect the synthetic example while the adapter is unavailable.", acceptableIds: [], expectedOutcome: "unavailable", weights: {}, confidence: 0, failure: "unavailable" },
  { id: "invalid", title: "Out-of-set response", intent: "Inspect the synthetic example with an invalid adapter response.", acceptableIds: [], expectedOutcome: "unavailable", weights: {}, confidence: 0, failure: "malformed" },
];

/** Scripted demo values, not Jev measurements or a semantic router. */
export function scenarioRouter(scenario: RoutingScenario): ToolRouter {
  return { source: "mock", review: async request => {
    if (scenario.failure === "unavailable") throw Error("Synthetic adapter outage");
    if (scenario.failure === "malformed") return { model: request.model, choice: "not_in_catalog", confidence: 1, probabilities: {} };
    const weights = request.options.map(option => [option.id, scenario.weights[option.id] ?? 0] as const);
    // A removed relevant tool does not promote an unrelated tool by renormalization.
    const probabilities = Object.fromEntries(weights);
    for (const [id, mass] of Object.entries(scenario.weights)) {
      if (request.options.some(option => option.id === id)) continue;
      const alternative = scenario.mockAlternatives?.[id];
      const target = alternative && Object.hasOwn(probabilities, alternative) ? alternative : "needs_clarification";
      probabilities[target]! += mass;
    }
    const total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
    if (total === 0) probabilities.needs_clarification = 1;
    const choice = Object.keys(probabilities).sort((a, b) => probabilities[b]! - probabilities[a]!)[0]!;
    return { model: request.model, choice, confidence: scenario.confidence, probabilities };
  } };
}
