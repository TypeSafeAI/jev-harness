import { boundedText, json, localOrigin } from "../../../examples/host/live";
import { liveHandle } from "../../../examples/host/runtime";
import { runArenaLanes } from "../../../examples/host/arena-lanes";
import { ARENA_CASES } from "../../../examples/arena/cases";
import { DEMO_CATALOG, DEMO_POLICY } from "../../../examples/routing/scenarios";
import { prepareToolContext, assembleToolBundle } from "../../../src/routing";
import { ARENA_TOOL_DEPENDENCIES } from "../../../examples/arena/tool-dependencies";
export const runtime = "nodejs";
export const maxDuration = 300;
let running = false;
export async function POST(request: Request) {
  if (!localOrigin(request)) return json(403, { error: "Use this app's local origin." });
  if (request.headers.get("content-type") !== "application/json") return json(415, { error: "Use application/json." });
  let caseId: string;
  try { const input = JSON.parse(await boundedText(request.body, 1024)); if (!input || Object.keys(input).join() !== "caseId" || typeof input.caseId !== "string") throw Error(); caseId = input.caseId; }
  catch { return json(400, { error: "Choose an arena example." }); }
  const fixture = ARENA_CASES.find(item => item.id === caseId);
  if (!fixture) return json(400, { error: "Unknown arena example." });
  if (running) return json(429, { error: "An arena comparison is already running on this host." });
  running = true;
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: unknown) => { if (!signal.aborted) controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n")); };
      try {
        emit({ type: "stage", value: "Asking Jev which tool schemas to expose…" });
        const routed = await liveHandle(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ intent: fixture.task, availableIds: DEMO_CATALOG.map(tool => tool.id) }), signal }));
        const body = await routed.json();
        emit({ type: "usage", measurement: body.measurement ?? null, attempted: body.attempted !== false, error: body.error ?? null });
        if (!routed.ok || !body.evidence) { emit({ type: "error", value: body.error ?? "Jev evidence unavailable. No CLI run started." }); return; }
        const prepared = await prepareToolContext({ catalog: DEMO_CATALOG, input: { intent: fixture.task, availableIds: DEMO_CATALOG.map(tool => tool.id) }, policy: DEMO_POLICY, router: { source: "jev", review: async () => body.evidence }, mode: "lean", signal });
        const { receipt } = prepared;
        if (receipt.outcome === "unavailable") { emit({ type: "error", value: "Routing evidence unavailable. No CLI run started." }); return; }
        emit({ type: "routing", receipt });
        const bundle = assembleToolBundle(receipt, ARENA_TOOL_DEPENDENCIES, { signal });
        if (receipt.outcome === "selected" && bundle.status !== "ready") { emit({ type: "error", value: bundle.reason }); return; }
        emit({ type: "stage", value: "Both agents are running in parallel. Results appear independently as each finishes." });
        await runArenaLanes(fixture, bundle.context.state.loadedIds, signal, emit);
        if (!signal.aborted) emit({ type: "done", at: new Date().toISOString() });
      } catch { emit({ type: "error", value: "The comparison could not complete. Check the local CLI configuration and retry explicitly." }); }
      finally { running = false; try { controller.close(); } catch {} }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
