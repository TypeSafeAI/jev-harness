import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveHandler, localOrigin } from "../examples/host/live.js";

test("live host bounds input, rebuilds choices and never returns keys or raw provider errors", async t => {
  let calls = 0;
  const handler = createLiveHandler({ fetch: async (_url, init) => {
    calls++;
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, "jev-1.13.0");
    assert.deepEqual(Object.keys(sent.questions.tool.criteria), ["read_file", "needs_clarification"]);
    assert.ok(!String(init?.body).includes("synthetic-test-credential"));
    return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "read_file", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } } }, usage: { input_tokens: 120, output_tokens: 20 }, private: "must not escape" });
  } });
  const base = "http://127.0.0.1:4173";
  const send = (body: unknown, origin = base, key = "synthetic-test-credential") => handler(new Request(base + "/api/route", { method: "POST", headers: { origin, "content-type": "application/json", "x-typesafe-api-key": key }, body: JSON.stringify(body) }));
  const input = { intent: "Read the synthetic sum file.", availableIds: ["read_file"] };
  assert.equal((await send(input, "https://elsewhere.example")).status, 403);
  assert.equal((await send({ ...input, availableIds: ["unknown"] })).status, 400);
  assert.equal((await send({ ...input, questions: {} })).status, 400);
  assert.equal((await send({ ...input, intent: "x".repeat(17000) })).status, 400);
  assert.equal(calls, 0);
  const response = await send(input); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.evidence.choice, "read_file");
  assert.equal(result.measurement.inputTokens, 120);
  assert.ok(result.measurement.requestBytes > 0);
  assert.ok(!JSON.stringify(result).includes("credential"));
  assert.ok(!JSON.stringify(result).includes("must not escape"));
  assert.equal(calls, 1);
});

test("provider failures and malformed evidence fail closed without disclosing raw data", async t => {
  let mode = "error";
  const handler = createLiveHandler({ serverKey: "synthetic-test-credential", fetch: async () => {
    if (mode === "error") throw Error("synthetic-test-credential private details");
    if (mode === "billing") return new Response("private billing body", { status: 402 });
    return Response.json({ model: "wrong-model", answers: { tool: { type: "choice", choice: "read_file", confidence: 1, probabilities: { read_file: 1, needs_clarification: 0 } } } });
  } });
  const base = "http://127.0.0.1:4173";
  for (const value of ["error", "billing", "model"]) {
    mode = value;
    const response = await handler(new Request(base + "/api/route", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ intent: "Read a synthetic file", availableIds: ["read_file"] }) }));
    const result = await response.json();
    assert.equal(result.evidence, null);
    assert.ok(result.error);
    assert.ok(!JSON.stringify(result).includes("private"));
    assert.ok(!JSON.stringify(result).includes("credential"));
    if (value === "billing") assert.match(result.error, /402/);
  }
});

test("local origin validates the actual Host when Next canonicalizes the request URL", () => {
  const url = "http://localhost:4173/api/route";
  assert.equal(localOrigin(new Request(url, { headers: { origin: "http://127.0.0.1:4173", host: "127.0.0.1:4173" } })), true);
  assert.equal(localOrigin(new Request(url, { headers: { origin: "http://evil.example:4173", host: "evil.example:4173" } })), false);
  assert.equal(localOrigin(new Request(url, { headers: { origin: "http://127.0.0.1:4173", host: "localhost:4173" } })), false);
});

test("manual override takes precedence and removing it restores the server key", async () => {
  const authorizations: string[] = [];
  const handler = createLiveHandler({ serverKey: "synthetic-server-credential", fetch: async (_url, init) => {
    authorizations.push(new Headers(init?.headers).get("authorization") ?? "");
    return Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "read_file", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } } } });
  } });
  const base = "http://127.0.0.1:4173";
  for (const override of [undefined, "synthetic-manual-credential", "synthetic-replacement-credential", undefined]) {
    const response = await handler(new Request(base + "/api/route", { method: "POST", headers: { origin: base, "content-type": "application/json", ...(override ? { "x-typesafe-api-key": override } : {}) }, body: JSON.stringify({ intent: "Read the synthetic file", availableIds: ["read_file"] }) }));
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes("credential"));
  }
  assert.deepEqual(authorizations, ["Bearer synthetic-server-credential", "Bearer synthetic-manual-credential", "Bearer synthetic-replacement-credential", "Bearer synthetic-server-credential"]);
});
