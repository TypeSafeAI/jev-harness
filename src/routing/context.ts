import type { ContextMode, ContextState, RoutingReceipt } from "./types.js";
import { freeze } from "./catalog.js";

/** Schema eviction/reloading only; no content summarization or relevance scoring. */
export function assembleContext(receipt: RoutingReceipt, mode: ContextMode, previous: ContextState = { loadedIds: [] }) {
  if (mode !== "lean" && mode !== "full") throw Error("Unknown context mode.");
  const available = new Set(receipt.request.options.filter(option => option.kind !== "fallback").map(option => option.id));
  const selected = new Set(receipt.selectedIds);
  const tools = receipt.catalog.filter(tool => available.has(tool.id) && (mode === "full" || (receipt.outcome === "selected" && selected.has(tool.id))))
    .map(({ id, kind, description, inputSchema }) => ({ id, kind, description, inputSchema }));
  const loadedIds = tools.map(tool => tool.id);
  const serialized = JSON.stringify({ intent: receipt.request.intent, tools });
  return freeze({ mode, tools, serialized, state: { loadedIds },
    addedIds: loadedIds.filter(id => !previous.loadedIds.includes(id)),
    evictedIds: previous.loadedIds.filter(id => !loadedIds.includes(id)) });
}
