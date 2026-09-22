import { runCodex } from "./codex";
import { DEMO_CATALOG } from "../routing/scenarios";
import type { ArenaCase } from "../arena/cases";
/** Keep the host occupied until BOTH isolated processes have settled, including failures. */
export async function runArenaLanes(fixture: ArenaCase, selectedIds: readonly string[], signal: AbortSignal, emit: (event: unknown) => void, run = runCodex) {
  const settled = await Promise.allSettled((["baseline", "integrated"] as const).map(async lane => {
    if (signal.aborted) return;
    const tools = lane === "baseline" ? DEMO_CATALOG : DEMO_CATALOG.filter(tool => selectedIds.includes(tool.id));
    emit({ type: "lane", lane, phase: "starting", tools: tools.map(tool => tool.id) });
    try {
      const result = await run(fixture, tools, signal, "codex", phase => emit({ type: "lane", lane, phase }));
      emit({ type: "result", lane, tools: tools.map(tool => tool.id), result });
    } catch (error) { emit({ type: "lane", lane, phase: "failed" }); throw error; }
  }));
  if (settled.some(result => result.status === "rejected")) throw Error("A CLI lane failed.");
}
