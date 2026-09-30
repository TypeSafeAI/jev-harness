import { test } from "node:test";
import assert from "node:assert/strict";
import { createJevChoiceRouter } from "../examples/host/jev-choice.js";
import { routeTools } from "../src/routing/index.js";
import { DEMO_CATALOG, DEMO_POLICY } from "../examples/routing/scenarios.js";

const input = { intent: "Read the synthetic file", availableIds: ["read_file"] };
const valid = () => ({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "read_file", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } } }, usage: { input_tokens: 100, output_tokens: 10 } });
const invalidSum = () => { const raw = valid(); raw.answers.tool.probabilities.needs_clarification = .09; return raw; };
const run = (handle: ReturnType<typeof createJevChoiceRouter>) => routeTools(DEMO_CATALOG, input, DEMO_POLICY, handle.router);

test("sum-only recovery records every identical dispatch and total usage", async () => {
  for (const failures of [1, 2, 3]) {
    const bodies: unknown[] = [], signals: unknown[] = [];
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async (_url, init) => {
      bodies.push(init?.body); signals.push(init?.signal);
      return Response.json(bodies.length <= failures ? invalidSum() : valid());
    } });
    const receipt = await run(handle);
    assert.equal(bodies.length, Math.min(failures + 1, 3));
    assert.equal(receipt.outcome, failures === 3 ? "unavailable" : "selected");
    assert.equal(new Set(bodies).size, 1); assert.equal(new Set(signals).size, 1);
    const m = handle.state.measurement!;
    assert.equal(m.attemptLedger?.attempts.length, bodies.length);
    assert.equal(m.inputTokens, bodies.length * 100); assert.equal(m.outputTokens, bodies.length * 10);
    assert.equal(m.attemptLedger?.returnedAttempt, failures === 3 ? null : failures + 1);
    assert.equal(m.attemptLedger?.stopReason, failures === 3 ? "exhausted" : "valid");
  }
});

test("default adapter never retries and recovery stops at every valid or other invalid answer", async () => {
  const cases = [invalidSum(), valid(), { ...valid(), model: "other" }, { ...valid(), answers: { tool: { ...valid().answers.tool, confidence: -1 } } },
    { ...valid(), answers: { tool: { ...valid().answers.tool, choice: "needs_clarification", probabilities: { read_file: .1, needs_clarification: .9 } } } },
    { ...valid(), answers: { tool: { ...valid().answers.tool, confidence: .1 } } },
    { ...valid(), answers: { tool: { ...valid().answers.tool, probabilities: { read_file: .5, needs_clarification: .5 } } } },
    { ...valid(), answers: { tool: { ...invalidSum().answers.tool, choice: "needs_clarification" } } },
    { ...valid(), answers: { tool: { ...valid().answers.tool, probabilities: { read_file: .9, private_option: .09 } } } }];
  for (const [index, raw] of cases.entries()) {
    let calls = 0;
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", ...(index ? { recovery: "probability_sum_only_v1" as const } : {}), fetch: async () => { calls++; return Response.json(raw); } });
    await run(handle); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(handle.state), /private_option|synthetic-test-credential|"other"/);
  }
});

test("pre-abort and local admission count no phantom requests; denied retry retains first usage", async () => {
  for (const allowed of [0, 1]) {
    let calls = 0;
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", beforeRequest: () => calls < allowed, fetch: async () => { calls++; return Response.json(invalidSum()); } });
    await run(handle); assert.equal(calls, allowed);
    assert.equal(handle.state.measurement!.attemptLedger?.stopReason, "local_limit");
    assert.equal(handle.state.measurement!.inputTokens, allowed * 100);
  }
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", signal: AbortSignal.abort(), fetch: async () => { assert.fail("must not dispatch"); } });
  await run(handle);
  assert.equal(handle.state.measurement?.attemptLedger?.attempts.length, 0);
});

test("observer exceptions cannot cause retries and a router cannot overwrite its first call", async () => {
  let calls = 0;
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", onMeasurement: () => { throw Error("observer failed"); }, fetch: async () => { calls++; return Response.json(valid()); } });
  assert.equal((await run(handle)).outcome, "selected");
  const before = JSON.stringify(handle.state); await run(handle);
  assert.equal(calls, 1); assert.equal(JSON.stringify(handle.state), before);
});

test("one original deadline bounds fetch and stalled body reads and cancels bodies", async () => {
  for (const mode of ["fetch", "body", "retry-body"] as const) {
    let calls = 0, cancelled = false;
    const started = performance.now();
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", timeoutMs: 45, fetch: async () => {
      calls++;
      if (mode === "fetch") return new Promise<Response>(() => {});
      if (mode === "retry-body" && calls === 1) { await new Promise(resolve => setTimeout(resolve, 25)); return Response.json(invalidSum()); }
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    } });
    // AbortSignal.timeout is unref'ed; keep this deliberately stalled fake alive.
    const keepAlive = setTimeout(() => {}, 1000);
    await run(handle); clearTimeout(keepAlive);
    assert.equal(handle.state.measurement?.attemptLedger?.stopReason, "timeout");
    assert.equal(calls, mode === "retry-body" ? 2 : 1);
    assert.ok(performance.now() - started < 500);
    if (mode !== "fetch") assert.equal(cancelled, true);
  }
});

test("caller abort during fetch/body or between attempts keeps exact observed dispatches", async () => {
  for (const phase of ["fetch", "body", "between"] as const) {
    const controller = new AbortController(); let calls = 0;
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", signal: controller.signal,
      onMeasurement: m => { if (phase === "between" && m.attemptLedger?.attempts[0]?.status === "invalid_sum") controller.abort(); },
      fetch: async () => { calls++; if (phase === "between") return Response.json(invalidSum());
        if (phase === "fetch") { controller.abort(); return new Promise<Response>(() => {}); }
        return new Response(new ReadableStream({ pull() { controller.abort(); } }));
      } });
    await run(handle); assert.equal(calls, 1);
    assert.equal(handle.state.measurement?.attemptLedger?.stopReason, "cancelled");
  }
});

test("HTTP, transport, empty, JSON and body-limit failures are terminal and sanitized", async () => {
  for (const [status, response] of [
    ["http_error", () => new Response("private", { status: 429 })],
    ["transport_error", () => { throw Error("private"); }],
    ["empty_body", () => new Response("")],
    ["invalid_json", () => new Response("private not JSON")],
    ["body_limit", () => new Response("x".repeat(64_001))],
  ] as const) {
    let calls = 0;
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async () => { calls++; return response(); } });
    await run(handle); assert.equal(calls, 1);
    assert.equal(handle.state.measurement?.attemptLedger?.attempts[0]?.status, status);
    assert.doesNotMatch(JSON.stringify(handle.state), /private/);
    if (status === "invalid_json") assert.equal(handle.state.measurement?.responseBytes, 16);
  }
});

test("strict ledger replay rejects transitions, projection, usage and totals tampering", async () => {
  const { parseMeasurement, attemptTotals } = await import("../examples/routing/measurement.js");
  let calls = 0;
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async () => {
    calls++; const raw = calls < 3 ? invalidSum() : valid();
    if (calls === 2) delete (raw.usage as Partial<typeof raw.usage>).input_tokens;
    return Response.json(raw);
  } });
  const receipt = await run(handle), m = handle.state.measurement!;
  assert.equal(m.inputTokens, null); assert.equal(m.outputTokens, 30);
  assert.deepEqual(attemptTotals(m.attemptLedger!).input, { total: null, reported: 200, unknown: 1 });
  assert.deepEqual(parseMeasurement(m, ["read_file", "needs_clarification"], receipt.evidence), m);
  for (const mutate of [
    (v: typeof m) => { v.inputTokens = 200; },
    (v: typeof m) => { v.attemptLedger!.attempts[1]!.index = 3; },
    (v: typeof m) => { v.attemptLedger!.attempts[0]!.status = "invalid_other"; },
    (v: typeof m) => { v.attemptLedger!.attempts[0]!.projection!.probabilities.private = .1; },
    (v: typeof m) => { v.attemptLedger!.attempts[0]!.diagnostic!.unexpectedOptions = 1; },
    (v: typeof m) => { v.attemptLedger!.maxAttempts = 1; },
    (v: typeof m) => { v.attemptLedger!.returnedAttempt = 1; },
    (v: typeof m) => { v.attemptLedger!.complete = false; },
  ]) { const value = structuredClone(m); mutate(value); assert.throws(() => parseMeasurement(value, ["read_file", "needs_clarification"], receipt.evidence)); }
  assert.throws(() => parseMeasurement(m, ["read_file", "needs_clarification"], { ...receipt.evidence!, confidence: .8 }));
});

test("provider option order cannot change canonical sum classification or ledger replay", async () => {
  const { parseMeasurement } = await import("../examples/routing/measurement.js");
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async () => Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "needs_clarification", confidence: .7, probabilities: { needs_clarification: .7, propose_patch: .2, read_file: .1 } } } }) });
  const receipt = await routeTools(DEMO_CATALOG, { ...input, availableIds: ["read_file", "propose_patch"] }, DEMO_POLICY, handle.router);
  assert.equal(receipt.outcome, "needs_clarification");
  const boundary = createJevChoiceRouter({ key: "synthetic-test-credential", recovery: "probability_sum_only_v1", fetch: async () => Response.json({ model: "jev-1.13.0", answers: { tool: { type: "choice", choice: "propose_patch", confidence: .9, probabilities: { needs_clarification: .000001, propose_patch: .9, read_file: .1 } } } }) });
  const accepted = await routeTools(DEMO_CATALOG, { ...input, availableIds: ["read_file", "propose_patch"] }, DEMO_POLICY, boundary.router);
  assert.equal(accepted.outcome, "selected"); assert.equal(boundary.state.measurement?.attemptLedger?.attempts.length, 1);
  assert.deepEqual(parseMeasurement(boundary.state.measurement!, accepted.request.options.map(o => o.id), accepted.evidence), boundary.state.measurement);
  assert.deepEqual(parseMeasurement(handle.state.measurement!, receipt.request.options.map(o => o.id), receipt.evidence), handle.state.measurement);
});

test("an eventually resolved aborted fetch has its unused response body cancelled", async () => {
  const controller = new AbortController(); let cancelled = false;
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", signal: controller.signal, fetch: async () => {
    controller.abort(); await Promise.resolve();
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  } });
  await run(handle); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(cancelled, true);
});

test("observer-triggered abort consumes a rejecting dispatched fetch", async () => {
  const controller = new AbortController();
  const unhandled: unknown[] = [], listener = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", listener);
  try {
    const handle = createJevChoiceRouter({ key: "synthetic-test-credential", signal: controller.signal,
      onMeasurement: m => { if (m.attemptLedger?.attempts[0]?.status === "pending") controller.abort(); },
      fetch: (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(Error("synthetic fetch aborted")), { once: true })) });
    await run(handle); await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(unhandled, []); assert.equal(handle.state.measurement?.attemptLedger?.stopReason, "cancelled");
  } finally { process.off("unhandledRejection", listener); }
});

test("ledger parser rejects incomplete request sets and impossible status/diagnostic combinations", async () => {
  const { parseMeasurement, measureLedger } = await import("../examples/routing/measurement.js");
  const make = async (response: () => Response) => { const h = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async () => response() }); await run(h); return h.state.measurement!; };
  const good = await make(() => Response.json(valid()));
  assert.throws(() => parseMeasurement(good, ["read_file", "needs_clarification", "propose_patch"]));
  assert.throws(() => parseMeasurement(good, input.availableIds));
  assert.throws(() => parseMeasurement(good, ["read_file", "needs_clarification"], null));
  const json = await make(() => new Response("not JSON"));
  json.attemptLedger!.attempts[0]!.httpStatus = 500;
  assert.throws(() => parseMeasurement(json));
  const sum = await make(() => Response.json(invalidSum()));
  sum.attemptLedger!.stopReason = "cancelled";
  assert.throws(() => parseMeasurement(sum));
  const wrong = await make(() => Response.json({ ...valid(), model: "wrong" }));
  wrong.attemptLedger!.attempts[0]!.diagnostic!.probabilitySum = 999;
  assert.throws(() => parseMeasurement(measureLedger(wrong.attemptLedger!, wrong.latencyMs)));
});

test("response byte accounting uses received bytes even for invalid UTF-8 JSON", async () => {
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async () => new Response(new Uint8Array([0xff])) });
  await run(handle);
  assert.equal(handle.state.measurement?.responseBytes, 1);
  assert.equal(handle.state.measurement?.attemptLedger?.attempts[0]?.status, "invalid_json");
});

test("subset telemetry still requires the mandatory clarification option", async () => {
  const { parseMeasurement, measureLedger } = await import("../examples/routing/measurement.js");
  const handle = createJevChoiceRouter({ key: "synthetic-test-credential", fetch: async () => Response.json(valid()) });
  await run(handle);
  const ledger = structuredClone(handle.state.measurement!.attemptLedger!);
  ledger.optionIds = ["read_file"];
  ledger.attempts[0]!.projection!.probabilities = { read_file: 1 };
  ledger.attempts[0]!.diagnostic!.probabilitySum = 1;
  assert.throws(() => parseMeasurement(measureLedger(ledger, handle.state.measurement!.latencyMs), ["read_file", "needs_clarification"], undefined, true));
});
