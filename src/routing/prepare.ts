import { freeze } from "./catalog.js";
import { assembleContext } from "./context.js";
import { routeTools } from "./route.js";
import type { Catalog, ContextState, RoutingInput, RoutingPolicy, RoutingReceipt, ToolRouter } from "./types.js";

/** Explicit host experiment choice; shadow retains the full available context. */
export type ToolContextMode = "shadow" | "lean";
export type ToolContext = ReturnType<typeof assembleContext>;
export interface PrepareToolContextOptions {
  catalog: Catalog;
  input: RoutingInput;
  policy: RoutingPolicy;
  router: ToolRouter;
  mode: ToolContextMode;
  previous?: ContextState;
  signal?: AbortSignal;
}
export interface PreparedToolContext {
  readonly mode: ToolContextMode;
  readonly receipt: RoutingReceipt;
  /** Comparison snapshots, including when the active handoff was cancelled. */
  readonly full: ToolContext;
  readonly lean: ToolContext;
  /** Descriptors for this handoff; cancellation always leaves this empty. */
  readonly context: ToolContext;
}

/**
 * Route once and prepare descriptors; no provider client, deadline or execution.
 * Shadow exposes all available schemas even when routing fails because the host
 * explicitly selected that experiment mode. Lean exposes only selected schemas.
 * Cancellation observed before return empties the active context in either mode;
 * receipt/full/lean retain routing evidence, including a selection completed just
 * before cancellation. Hosts consume `context` and check freshness before use.
 * Both comparisons use the same detached previous state, not each other's state.
 */
export async function prepareToolContext({ catalog, input, policy, router, mode, previous, signal }: PrepareToolContextOptions): Promise<PreparedToolContext> {
  if (mode !== "shadow" && mode !== "lean") throw Error("Unknown tool context mode; choose shadow or lean explicitly.");
  const prior: ContextState = { loadedIds: [...(previous?.loadedIds ?? [])] };
  // routeTools snapshots catalog, input and policy before its first await.
  const receipt = await routeTools(catalog, input, policy, router, signal);
  const full = assembleContext(receipt, "full", prior);
  const lean = assembleContext(receipt, "lean", prior);
  const context = signal?.aborted
    ? assembleContext({ ...receipt, outcome: "unavailable", selectedIds: [] }, "lean", prior)
    : mode === "shadow" ? full : lean;
  return freeze({ mode, receipt, full, lean, context });
}
