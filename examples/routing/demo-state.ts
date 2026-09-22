import { assembleContext, type ContextMode, type ContextState } from "../../src/routing/index.js";
import { compareScenario } from "./compare.js";
import { DEMO_POLICY, SCENARIOS, type RoutingScenario } from "./scenarios.js";
import type { MeasuredRouter } from "./live-client.js";
export interface DemoInput { intent: string; availableIds: readonly string[]; mode: ContextMode; topK: number; maxCostUnits: number }
/** A browser-only synthetic host; unknown chat text always asks for clarification. */
export async function runDemo(input: DemoInput, previous?: ContextState, router?: MeasuredRouter) {
  const scenario: RoutingScenario = SCENARIOS.find(item => item.intent === input.intent.trim()) ?? {
    id: "custom", title: "Custom task", intent: input.intent.trim(), acceptableIds: [], expectedOutcome: "needs_clarification", weights: { needs_clarification: 1 }, confidence: 1,
  };
  const comparison = await compareScenario(scenario, input.availableIds, { ...DEMO_POLICY, topK: input.topK, maxCostUnits: input.maxCostUnits }, router);
  return { comparison, context: assembleContext(comparison.receipt, input.mode, previous) };
}
