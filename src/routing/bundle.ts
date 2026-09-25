import { freeze } from "./catalog.js";
import { assembleContext } from "./context.js";
import type { ContextState, RoutingReceipt } from "./types.js";

/** Host-declared prerequisites, separate from Jev probabilities and selection. */
export type ToolDependencies = Readonly<Record<string, readonly string[]>>;

/**
 * Build a dependency-complete schema handoff without changing routing evidence.
 * topK limits routed roots; explicitly declared prerequisites are additional.
 * Every exposed descriptor must remain available and within the per-tool cost
 * limit. Missing prerequisites withhold the whole handoff. No tool executes and
 * no dependency, descriptor or favorable route grants permission.
 */
export function assembleToolBundle(receipt: RoutingReceipt, dependencies: ToolDependencies, options: { previous?: ContextState; signal?: AbortSignal } = {}) {
  const catalogIds = new Set(receipt.catalog.map(tool => tool.id));
  const graph = new Map<string, string[]>();
  for (const [id, values] of Object.entries(dependencies)) {
    if (!catalogIds.has(id) || !Array.isArray(values) || Array.from(values).some(value => typeof value !== "string" || !catalogIds.has(value))) throw Error("Tool dependencies must name catalog descriptors.");
    if (new Set(values).size !== values.length) throw Error("Tool prerequisites must be unique.");
    graph.set(id, [...values]);
  }
  const visited = new Set<string>(), active = new Set<string>();
  const checkCycle = (id: string) => {
    if (active.has(id)) throw Error("Tool dependency cycle.");
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of graph.get(id) ?? []) checkCycle(dependency);
    active.delete(id); visited.add(id);
  };
  for (const id of graph.keys()) checkCycle(id);

  const roots = new Set(receipt.selectedIds), needed = new Set<string>();
  const include = (id: string) => {
    if (needed.has(id)) return;
    needed.add(id);
    for (const dependency of graph.get(id) ?? []) include(dependency);
  };
  if (receipt.outcome === "selected") for (const id of roots) include(id);
  const available = new Set(receipt.request.options.filter(option => option.kind !== "fallback").map(option => option.id));
  const blockedIds = [...needed].filter(id => !available.has(id) || !catalogIds.has(id) || receipt.catalog.find(tool => tool.id === id)!.estimatedCostUnits > receipt.policy.maxCostUnits);
  const ready = !options.signal?.aborted && receipt.outcome === "selected" && roots.size > 0 && blockedIds.length === 0;
  const exposedIds = receipt.catalog.filter(tool => ready && needed.has(tool.id)).map(tool => tool.id);
  // This derived selection is for schema assembly only; return the original roots
  // separately and never alter the receipt or its evidence/selectedIds.
  const context = assembleContext({ ...receipt, selectedIds: exposedIds }, "lean", options.previous);
  return freeze({ status: ready ? "ready" as const : "withheld" as const, rootIds: [...roots],
    prerequisiteIds: receipt.catalog.filter(tool => needed.has(tool.id) && !roots.has(tool.id)).map(tool => tool.id),
    blockedIds, context,
    estimatedCostUnits: receipt.catalog.reduce((sum, tool) => sum + (exposedIds.includes(tool.id) ? tool.estimatedCostUnits : 0), 0),
    reason: ready ? "Routed tools with host-declared prerequisites. Evidence only; host authorization remains separate."
      : options.signal?.aborted ? "Handoff cancelled; no schemas exposed."
        : blockedIds.length ? "A required descriptor is unavailable or over the per-tool budget; no schemas exposed."
          : "Routing did not select a tool; no schemas exposed.",
  });
}
