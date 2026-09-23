import { pathToFileURL } from "node:url";
import { createCatalog, prepareToolContext, type ContextState, type RoutingPolicy, type RoutingReceipt, type ToolContextMode, type ToolRouter } from "../../src/index.js";

// Synthetic descriptors only: no handlers, files, provider clients or credentials.
const catalog = createCatalog([
  { id: "read", kind: "tool", description: "Read one named synthetic file.", estimatedCostUnits: 1,
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Relative synthetic file path." } }, required: ["path"], additionalProperties: false } },
  { id: "inspect", kind: "subagent", description: "Describe a synthetic file with a specialist; no agent is launched.", estimatedCostUnits: 8,
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Bounded synthetic inspection task." } }, required: ["task"], additionalProperties: false } },
]);
const policy: RoutingPolicy = { topK: 1, confidenceFloor: 0.7, probabilityFloor: 0.2, relevanceWindow: 0.1, maxCostUnits: 10 };
type SyntheticCase = "read" | "inspect" | "inspect_removed" | "inspect_restored" | "clarify" | "over_budget" | "outage";

/** Scripted evidence demonstrates the seam; it is not a semantic evaluation. */
function syntheticRouter(scenario: SyntheticCase): ToolRouter {
  return { source: "mock", review: async request => {
    if (scenario === "outage") throw Error("Synthetic adapter outage");
    const weights: Record<string, number> = scenario === "clarify"
      ? { read: 0.05, inspect: 0.05, needs_clarification: 0.9 }
      : scenario === "inspect_removed"
      ? { read: 0.96, needs_clarification: 0.04 }
      : scenario === "inspect" || scenario === "inspect_restored"
      ? { read: 0.04, inspect: 0.92, needs_clarification: 0.04 }
      : { read: 0.46, inspect: 0.5, needs_clarification: 0.04 };
    // Normalize fresh evidence over this request's options, never a prior snapshot.
    const total = request.options.reduce((sum, option) => sum + (weights[option.id] ?? 0), 0);
    const probabilities = Object.fromEntries(request.options.map(option => [option.id, (weights[option.id] ?? 0) / total]));
    const choice = Object.keys(probabilities).sort((a, b) => probabilities[b]! - probabilities[a]!)[0]!;
    return { model: request.model, choice, confidence: 0.9, probabilities };
  } };
}

function observationNote(outcome: RoutingReceipt["outcome"]): string {
  switch (outcome) {
    case "selected": return "Selection is routing evidence. The host still owns argument validation, permissions and any execution.";
    case "needs_clarification": return "Record the ambiguity and ask for clarification before considering a selection.";
    case "no_match": return "No descriptor met the configured policy. Reconsider the task, availability or policy explicitly.";
    case "unavailable": return "Record the adapter failure. Keep the requested experiment mode; do not switch modes on an outage.";
  }
}

export interface IntegrationObservation {
  scenario: SyntheticCase;
  mode: ToolContextMode;
  outcome: RoutingReceipt["outcome"];
  exposedIds: readonly string[];
  selectedIds: readonly string[];
  addedIds: readonly string[];
  evictedIds: readonly string[];
  context: string;
  note: string;
  receipt: RoutingReceipt;
}

/** Local observations only. A real host supplies transport, storage and its own policy. */
export async function runIntegrationDemo() {
  const observations: IntegrationObservation[] = [];
  for (const mode of ["shadow", "lean"] as const) {
    let previous: ContextState = { loadedIds: [] };
    for (const scenario of ["read", "inspect", "inspect_removed", "inspect_restored", "clarify", "over_budget", "outage"] as const) {
      const intent = scenario === "clarify" ? "Clean up the synthetic helper."
        : scenario === "inspect" || scenario === "inspect_restored" ? "Explain both helpers in synthetic src/example.ts."
        : "Read synthetic src/example.ts.";
      // Host availability can change between handoffs. Keep the descriptor in the
      // catalog so a later snapshot can expose it again without reconstructing it.
      const availableIds = scenario === "inspect_removed" ? ["read"] : catalog.map(tool => tool.id);
      const prepared = await prepareToolContext({
        catalog,
        input: { intent, availableIds },
        policy: scenario === "over_budget" ? { ...policy, maxCostUnits: 0 } : policy,
        router: syntheticRouter(scenario),
        mode,
        previous,
      });
      // The context string is the proposed handoff to a host's existing proposer.
      // This example records it without calling a proposer, tool or specialist.
      observations.push({ scenario, mode: prepared.mode, outcome: prepared.receipt.outcome,
        exposedIds: prepared.context.state.loadedIds, selectedIds: prepared.receipt.selectedIds,
        addedIds: prepared.context.addedIds, evictedIds: prepared.context.evictedIds,
        context: prepared.context.serialized, note: observationNote(prepared.receipt.outcome), receipt: prepared.receipt });
      previous = prepared.context.state;
    }
  }
  return { source: "synthetic" as const, execution: { applied: false as const },
    note: "Offline scripted evidence; no provider usage, quality, latency or savings measured. Shadow is an explicit full-context experiment, not an outage fallback.",
    observations };
}

// Run with: pnpm exec tsx examples/integration/host.ts
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runIntegrationDemo(), null, 2));
}
