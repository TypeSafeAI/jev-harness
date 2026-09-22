import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "node:http";
import { once } from "node:events";
import * as serverModule from "../examples/routing/server.js";
import * as host from "../examples/routing/demo-state.js";

test("the demo serves only its static module graph on loopback", async t => {
  assert.equal(typeof serverModule.createDemoServer, "function");
  const server = serverModule.createDemoServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy")!, /connect-src 'none'/);
  assert.match(await page.text(), /Routing room/);
  for (const pathname of ["/.env", "/package.json", "/server.ts", "/modules/examples/routing/server.js", "/modules/src/contract/decide.js", "/missing", "/%2e%2e/package.json"])
    assert.equal((await fetch(base + pathname)).status, 404, pathname);
  assert.equal((await fetch(base, { method: "POST", body: "synthetic task" })).status, 405);
  // Native fetch rewrites Host; send an actual forged Host with node:http.
  const foreignHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(base, { headers: { host: "untrusted.example" } }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject);
  });
  assert.equal(foreignHostStatus, 403);
  const head = await fetch(base, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const queue = ["/modules/examples/routing/browser.js"];
  const visited = new Set<string>();
  while (queue.length) {
    const pathname = queue.shift()!;
    if (visited.has(pathname)) continue;
    visited.add(pathname);
    const response = await fetch(base + pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get("content-type")!, /javascript/);
    const source = await response.text();
    for (const match of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) queue.push(new URL(match[1]!, base + pathname).pathname);
  }
  assert.ok(visited.size >= 8);
});

test("custom chat text clarifies locally and availability changes evict old schemas", async () => {
  const initial = await host.runDemo({ intent: "Read src/sum.ts in the synthetic workspace.", availableIds: ["read_file", "propose_patch", "inspect_agent"], mode: "lean", topK: 1, maxCostUnits: 10 });
  assert.deepEqual(initial.context.state.loadedIds, ["read_file"]);
  const disabled = await host.runDemo({ intent: initial.comparison.receipt.request.intent, availableIds: ["inspect_agent"], mode: "lean", topK: 1, maxCostUnits: 10 }, initial.context.state);
  assert.deepEqual(disabled.context.evictedIds, ["read_file"]);
  assert.deepEqual(disabled.context.addedIds, ["inspect_agent"]);
  const custom = await host.runDemo({ intent: "<img src=x onerror=alert(1)>", availableIds: ["read_file"], mode: "lean", topK: 1, maxCostUnits: 10 }, disabled.context.state);
  assert.equal(custom.comparison.receipt.outcome, "needs_clarification");
  assert.equal(custom.comparison.receipt.request.intent, "<img src=x onerror=alert(1)>");
  assert.deepEqual(custom.context.state.loadedIds, []);
  assert.equal(custom.comparison.receipt.execution.applied, false);
});
