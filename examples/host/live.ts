/** Local Next.js host adapter. Never exported by the pure harness package. */
import { routeTools } from "../../src/routing/index.js";
import { DEMO_CATALOG, DEMO_POLICY } from "../routing/scenarios.js";
import { boundedText, createJevChoiceRouter } from "./jev-choice.js";
export { boundedText };
export function localOrigin(request: Request) {
  try {
    const url = new URL(request.url), origin = new URL(request.headers.get("origin") ?? "");
    const loopback = (name: string) => ["127.0.0.1", "localhost", "[::1]"].includes(name);
    // Next may canonicalize request.url to localhost even when Host is 127.0.0.1.
    return loopback(url.hostname) && loopback(origin.hostname) && origin.protocol === "http:" && origin.host === (request.headers.get("host") ?? url.host) && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}
export function json(status: number, body: unknown) { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export function createLiveHandler(options: { fetch?: typeof fetch; serverKey?: string } = {}) {
  const upstreamFetch = options.fetch ?? fetch;
  let active = 0; let started: number[] = [];
  return async (request: Request): Promise<Response> => {
    const reject = (status: number, error: string) => json(status, { error, attempted: false });
    if (request.method !== "POST") return reject(405, "Use POST.");
    if (!localOrigin(request)) return reject(403, "Use this app's local origin.");
    if (request.headers.get("content-type") !== "application/json") return reject(415, "Use application/json.");
    const override = request.headers.get("x-typesafe-api-key");
    const key = (override ?? options.serverKey)?.trim();
    if (!key || key.length > 1024 || !/^[\x21-\x7e]+$/.test(key)) return reject(400, "Add a valid TypeSafe API key in settings.");
    let input: { intent: string; availableIds: string[] };
    try {
      input = JSON.parse(await boundedText(request.body, 68_000));
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join() !== "availableIds,intent" || typeof input.intent !== "string" || !input.intent.trim() || input.intent.length > 16_000 || !Array.isArray(input.availableIds) || input.availableIds.length > DEMO_CATALOG.length || new Set(input.availableIds).size !== input.availableIds.length || input.availableIds.some(id => !DEMO_CATALOG.some(tool => tool.id === id))) throw Error();
    } catch { return reject(400, "Invalid routing input."); }
    started = started.filter(at => Date.now() - at < 60_000);
    if (active >= 2 || started.length >= 30) return reject(429, "Local request limit reached. Wait a minute before retrying.");
    started.push(Date.now()); active++;
    const jev = createJevChoiceRouter({ key, fetch: upstreamFetch, signal: request.signal });
    try {
      const receipt = await routeTools(DEMO_CATALOG, input, DEMO_POLICY, jev.router, request.signal);
      const measurement = jev.state.measurement;
      return json(200, { evidence: receipt.evidence, measurement, attempted: measurement !== null, error: receipt.outcome === "unavailable" ? jev.state.error ?? "Jev returned no usable evidence. No tool was selected." : null });
    } catch { return json(502, { error: "The live request could not complete. Retry explicitly.", attempted: jev.state.measurement !== null }); }
    finally { active--; }
  };
}
