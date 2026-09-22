import type { ToolRouter } from "../../src/routing/index.js";
import { readApiKey } from "./api-key.js";
import { recordUsage } from "./usage.js";
export interface RouterMeasurement { requestBytes: number; responseBytes: number | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number }
export interface MeasuredRouter extends ToolRouter { measurement?: RouterMeasurement; error?: string }
export function liveRouter(signal: AbortSignal): MeasuredRouter {
  const router: MeasuredRouter = { source: "jev", async review(query) {
    const key = readApiKey();
    let attempted = true;
    try {
    const result = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-typesafe-api-key": key } : {}) }, body: JSON.stringify({ intent: query.intent, availableIds: query.options.filter(option => option.kind !== "fallback").map(option => option.id) }), signal });
    const body = await result.json();
    attempted = body.attempted !== false;
    if (body.measurement) router.measurement = body.measurement;
    if (body.error) router.error = body.error;
    if (!result.ok) throw Error("Live routing failed.");
    return body.evidence;
    } catch { router.error ??= "Live transport failed. Provider usage is unknown; retry explicitly."; throw Error("Live transport failed."); }
    finally { if (attempted) recordUsage({ at: new Date().toISOString(), status: signal.aborted ? "cancelled" : router.error ? "failed" : "success", input: router.measurement?.inputTokens ?? null, output: router.measurement?.outputTokens ?? null, latencyMs: router.measurement?.latencyMs ?? null, keySource: key ? "personal" : "host" }); }
  } };
  return router;
}
