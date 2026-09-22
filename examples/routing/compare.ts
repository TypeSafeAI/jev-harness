import { assembleContext, routeTools, type RoutingPolicy } from "../../src/routing/index.js";
import { DEMO_CATALOG, DEMO_POLICY, scenarioRouter, type RoutingScenario } from "./scenarios.js";

import type { MeasuredRouter } from "./live-client.js";

const bytes = (value: string) => new TextEncoder().encode(value).length;
/** Explicit proxy only; provider tokenizers and caching can differ materially. */
const estimatedTokens = (value: string) => Math.ceil(bytes(value) / 4);

export async function compareScenario(scenario: RoutingScenario, availableIds: readonly string[] = DEMO_CATALOG.map(tool => tool.id), policy: RoutingPolicy = DEMO_POLICY, router?: MeasuredRouter) {
  const expected = { id: scenario.id, outcome: scenario.expectedOutcome, acceptableIds: [...scenario.acceptableIds] };
  const receipt = await routeTools(DEMO_CATALOG, { intent: scenario.intent, availableIds }, policy, router ?? scenarioRouter(scenario));
  const full = assembleContext(receipt, "full");
  const lean = assembleContext(receipt, "lean");
  const available = new Set(receipt.request.options.map(option => option.id));
  const acceptable = receipt.catalog.filter(tool => expected.acceptableIds.includes(tool.id) && available.has(tool.id) && tool.estimatedCostUnits <= receipt.policy.maxCostUnits);
  const cheapest = acceptable.length ? Math.min(...acceptable.map(tool => tool.estimatedCostUnits)) : null;
  const selected = DEMO_CATALOG.filter(tool => receipt.selectedIds.includes(tool.id));
  const includesAcceptable = (ids: readonly string[]) => acceptable.length ? ids.some(id => acceptable.some(tool => tool.id === id)) : null;
  const requestText = JSON.stringify(receipt.request);
  const routerBytes = receipt.request.options.length === 1 ? 0 : router ? router.measurement?.requestBytes ?? null : bytes(requestText);
  return { scenarioId: expected.id, receipt, full, lean,
    expectationMet: receipt.outcome === expected.outcome && (expected.outcome !== "selected" || includesAcceptable(receipt.selectedIds) === true),
    metrics: {
      fullContextBytes: bytes(full.serialized), leanContextBytes: bytes(lean.serialized),
      contextReductionFraction: 1 - bytes(lean.serialized) / bytes(full.serialized),
      fullContextEstimatedTokens: estimatedTokens(full.serialized), leanContextEstimatedTokens: estimatedTokens(lean.serialized),
      routerRequestBytes: routerBytes,
      // Full baseline assembles all schemas without routing. Lean pays for both inputs.
      leanTotalEstimatedInputTokens: routerBytes === null ? null : estimatedTokens(lean.serialized) + Math.ceil(routerBytes / 4),
      routerResponseEstimatedTokens: router?.measurement ? (router.measurement.responseBytes === null ? null : Math.ceil(router.measurement.responseBytes / 4)) : receipt.evidence === null ? null : estimatedTokens(JSON.stringify(receipt.evidence)),
      fullAcceptableToolIncluded: includesAcceptable(full.state.loadedIds), leanAcceptableToolIncluded: includesAcceptable(lean.state.loadedIds),
      cheapestAcceptableSelected: cheapest === null ? null : selected.some(tool => expected.acceptableIds.includes(tool.id) && tool.estimatedCostUnits === cheapest),
      selectedEstimatedCostUnits: selected.reduce((sum, tool) => sum + tool.estimatedCostUnits, 0),
      providerTokens: router?.measurement ? { input: router.measurement.inputTokens, output: router.measurement.outputTokens } : null, executionLatencyMs: null,
    },
  };
}
