import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const modules = ["src/contract/types", "src/routing/index", "src/routing/types", "src/routing/catalog", "src/routing/route", "src/routing/context", "examples/routing/scenarios", "examples/routing/compare", "examples/routing/demo-state", "examples/routing/browser"];
const assets = new Map<string, { file: URL; type: string }>([
  ["/", { file: new URL("./index.html", import.meta.url), type: "text/html; charset=utf-8" }],
  ["/favicon.svg", { file: new URL("./favicon.svg", import.meta.url), type: "image/svg+xml" }],
  ["/style.css", { file: new URL("./style.css", import.meta.url), type: "text/css; charset=utf-8" }],
  ...modules.map(name => [`/modules/${name}.js`, { file: new URL(`../../.demo/${name}.js`, import.meta.url), type: "text/javascript; charset=utf-8" }] as const),
]);
/** Static demo assets only. No task endpoint, filesystem browsing or provider I/O. */
export function createDemoServer() {
  return createServer(async (request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    const port = request.socket.localPort;
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) { response.writeHead(403).end(); return; }
    if (request.method !== "GET" && request.method !== "HEAD") { response.setHeader("Allow", "GET, HEAD"); response.writeHead(405).end(); return; }
    const asset = assets.get(request.url ?? "");
    if (!asset) { response.writeHead(404).end(); return; }
    try {
      const body = await readFile(asset.file);
      response.setHeader("Content-Type", asset.type);
      response.writeHead(200).end(request.method === "HEAD" ? undefined : body);
    } catch { response.writeHead(503).end("Demo assets unavailable. Run pnpm build:demo."); }
  });
}
