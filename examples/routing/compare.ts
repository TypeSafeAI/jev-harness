import { assembleContext, routeTools, type RoutingPolicy } from "../../src/routing/index.js";
import { DEMO_CATALOG, DEMO_POLICY, scenarioRouter, type RoutingScenario } from "./scenarios.js";

const bytes = (value: string) => new TextEncoder().encode(value).length;
/** Explicit proxy only; provider tokenizers and caching can differ materially. */
const estimatedTokens = (value: string) => Math.ceil(bytes(value) / 4);

export async function compareScenario(scenario: RoutingScenario, availableIds: readonly string[] = DEMO_CATALOG.map(tool => tool.id), policy: RoutingPolicy = DEMO_POLICY) {
  const expected = { id: scenario.id, outcome: scenario.expectedOutcome, acceptableIds: [...scenario.acceptableIds] };
  const receipt = await routeTools(DEMO_CATALOG, { intent: scenario.intent, availableIds }, policy, scenarioRouter(scenario));
  const full = assembleContext(receipt, "full");
  const lean = assembleContext(receipt, "lean");
  const available = new Set(receipt.request.options.map(option => option.id));
  const acceptable = receipt.catalog.filter(tool => expected.acceptableIds.includes(tool.id) && available.has(tool.id) && tool.estimatedCostUnits <= receipt.policy.maxCostUnits);
  const cheapest = acceptable.length ? Math.min(...acceptable.map(tool => tool.estimatedCostUnits)) : null;
  const selected = DEMO_CATALOG.filter(tool => receipt.selectedIds.includes(tool.id));
  const includesAcceptable = (ids: readonly string[]) => acceptable.length ? ids.some(id => acceptable.some(tool => tool.id === id)) : null;
  const requestText = JSON.stringify(receipt.request);
  return { scenarioId: expected.id, receipt, full, lean,
    expectationMet: receipt.outcome === expected.outcome && (expected.outcome !== "selected" || includesAcceptable(receipt.selectedIds) === true),
    metrics: {
      fullContextBytes: bytes(full.serialized), leanContextBytes: bytes(lean.serialized),
      contextReductionFraction: 1 - bytes(lean.serialized) / bytes(full.serialized),
      fullContextEstimatedTokens: estimatedTokens(full.serialized), leanContextEstimatedTokens: estimatedTokens(lean.serialized),
      routerRequestBytes: receipt.request.options.length > 1 ? bytes(requestText) : 0,
      // Full baseline assembles all schemas without routing. Lean pays for both inputs.
      leanTotalEstimatedInputTokens: estimatedTokens(lean.serialized) + (receipt.request.options.length > 1 ? estimatedTokens(requestText) : 0),
      routerResponseEstimatedTokens: receipt.evidence === null ? null : estimatedTokens(JSON.stringify(receipt.evidence)),
      fullAcceptableToolIncluded: includesAcceptable(full.state.loadedIds), leanAcceptableToolIncluded: includesAcceptable(lean.state.loadedIds),
      cheapestAcceptableSelected: cheapest === null ? null : selected.some(tool => expected.acceptableIds.includes(tool.id) && tool.estimatedCostUnits === cheapest),
      selectedEstimatedCostUnits: selected.reduce((sum, tool) => sum + tool.estimatedCostUnits, 0),
      providerTokens: null, executionLatencyMs: null,
    },
  };
}
