/** Offline UI acceptance; synthetic NDJSON replaces both live providers. */
export async function verifyArena(page, baseURL) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  let mode = "normal";
  const result = { status: "completed", answer: "The synthetic sum returns 5.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 300, outputTokens: 50, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  await page.route("**/api/arena", async route => {
    let events = [
      { type: "usage", attempted: true, measurement: { inputTokens: 100, outputTokens: 10, requestBytes: 400, responseBytes: 40, latencyMs: 200 } },
      { type: "routing", receipt: { selectedIds: ["read_file"], reason: "One fixture tool selected.", evidence: { probabilities: { read_file: .9, needs_clarification: .1 } }, policy: { topK: 1, confidenceFloor: .6, probabilityFloor: .2, maxCostUnits: 10 } } },
      { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result },
      { type: "result", lane: "integrated", tools: ["read_file"], result: { ...result, inputTokens: mode === "unknown" ? null : 950, toolCallCount: mode === "zero" ? 0 : 1, toolCalls: mode === "zero" ? [] : result.toolCalls } },
      { type: "done" },
    ];
    if (mode === "proposal") events = events.map(event => event.type === "result" ? { ...event, result: { ...event.result, toolCalls: [{ tool: "propose_patch", status: "returned", at: "2026-09-22T00:00:00Z", proposal: { path: "src/sum.ts", patch: "@@\n- before\n+ after", rationale: "Synthetic pending fix", applied: false } }] } } : event);
    if (mode === "eof") events = [{ type: "stage", value: "Asking Jev…" }];
    if (mode === "skipped") events = [{ type: "usage", attempted: false }, { type: "error", value: "No key. No request made." }];
    await route.fulfill({ contentType: "application/x-ndjson", body: events.map(e => JSON.stringify(e)).join("\n") + "\n" });
  });
  try {
    await page.goto(baseURL + "/arena");
    const run = async () => { await page.getByRole("button", { name: "Run comparison" }).click(); await page.waitForFunction(() => !document.querySelector(".arena-controls button.primary").disabled); };
    await run();
    check(await page.getByText("3 tools → 1 exposed with Jev", { exact: true }).isVisible(), "tool exposure shown visually");
    check(await page.getByText("50 more tokens", { exact: true }).isVisible(), "headline includes router overhead even when savings disappear");
    check(await page.getByText("1 fixture call returned", { exact: true }).count() === 2, "actual calls visible per lane");
    check(await page.getByText("The synthetic sum returns 5.", { exact: true }).count() === 2, "answers visible side by side");
    check(await page.locator(".accounting-chart").isHidden(), "accounting disclosed on demand");
    await page.locator(".run-inspector > summary").click();
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await dl).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw); check(exported.jevUsage.inputTokens === 100 && exported.applied === false, "export retains overhead and nonexecution");
    await page.getByRole("tab", { name: "Tool activity" }).click();
    check(await page.locator(".event-list li").count() === 2, "tool activity is a readable event list");
    await page.getByRole("tab", { name: "Jev’s decision" }).click();
    check(await page.getByText("90%", { exact: true }).isVisible(), "routing evidence is visualized as a distribution");
    check(await page.getByText("View raw routing receipt", { exact: true }).isVisible(), "raw data is a second-level disclosure");
    check(await page.locator(".raw-evidence pre").isHidden(), "raw receipt stays collapsed");
    await page.getByRole("tab", { name: "Jev’s decision" }).focus();
    await page.keyboard.press("ArrowRight");
    check(await page.getByRole("tab", { name: "Test setup" }).getAttribute("aria-selected") === "true", "inspector tabs support arrow-key navigation");
    check(await page.getByText("Two lanes, in parallel", { exact: true }).isVisible(), "setup describes concurrent execution");
    await page.keyboard.press("Home");
    check(await page.getByRole("tab", { name: "Usage", exact: true }).getAttribute("aria-selected") === "true", "Home selects first inspector tab");
    await page.locator(".run-inspector > summary").click();
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `arena fits ${width}px`);
      await page.locator(".run-inspector > summary").click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `expanded accounting fits ${width}px`);
      await page.locator(".run-inspector > summary").click();
    }
    mode = "zero"; await run();
    check(await page.getByText("No fixture call observed", { exact: true }).isVisible(), "completed CLI with zero calls is not implied execution");
    mode = "unknown"; await run();
    check(await page.getByText("Usage incomplete", { exact: true }).isVisible(), "unknown usage never becomes savings");
    mode = "eof"; await run();
    check((await page.locator("#arena-status").textContent()).includes("partial"), "early EOF shows partial status");
    await page.getByRole("button", { name: "Usage · 4", exact: true }).click();
    check((await page.locator("#usage-unknown").textContent()).includes("1 requests"), "early EOF records unknown usage");
    await page.getByRole("button", { name: "Close usage dashboard" }).click();
    mode = "skipped"; await run();
    check(await page.getByRole("button", { name: "Usage · 4", exact: true }).isVisible(), "explicit skipped request does not add usage");
    mode = "proposal"; await run();
    await page.locator(".run-inspector > summary").click();
    await page.getByRole("tab", { name: "Tool activity" }).click();
    await page.getByText("Inspect recorded proposal", { exact: true }).first().click();
    check((await page.locator(".recorded-proposal pre").first().textContent()).includes("+ after"), "recorded proposals expose their pending diff in the inspector");
    const proposalDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const proposalStream = await (await proposalDownload).createReadStream(); let proposalJson = ""; for await (const chunk of proposalStream) proposalJson += chunk;
    check(JSON.parse(proposalJson).lanes.baseline.result.toolCalls[0].proposal.applied === false, "proposal export preserves nonexecution and recorded data");
    return { checks, count: checks.length, providerCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}

/** Held streams verify visible progress/cancellation without a CLI or provider. Use a fresh page. */
export async function verifyArenaProgress(page, baseURL) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (input !== "/api/arena") return original(input, init);
      return new Response(new ReadableStream({ start(controller) {
        const emit = event => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
        emit({ type: "usage", attempted: true, measurement: { inputTokens: 20, outputTokens: 3, latencyMs: 2 } });
        emit({ type: "routing", receipt: { selectedIds: ["read_file"] } });
        emit({ type: "stage", value: "Both agents are running in parallel." });
        emit({ type: "lane", lane: "baseline", phase: "working" });
        emit({ type: "lane", lane: "integrated", phase: "calling" });
        window.finishArenaBaseline = (zero = false) => emit({ type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result: { status: "completed", answer: "First lane finished.", durationMs: 1000, inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, toolCallCount: zero ? 0 : 1, traceTruncated: false, toolCalls: zero ? [] : [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null } });
        init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "application/x-ndjson" } });
    };
  });
  await page.goto(baseURL + "/arena");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page.getByText("Both agents are running in parallel.", { exact: true }).waitFor();
  check((await page.locator(".baseline .lane-status").textContent()).includes("Agent is working"), "baseline shows independent working state");
  check((await page.locator(".integrated .lane-status").textContent()).includes("Calling a fixture tool"), "integrated shows independent tool activity");
  await page.waitForFunction(() => [...document.querySelectorAll(".lane-status small")].every(e => parseInt(e.textContent) >= 1));
  check(await page.locator(".lane-status small").count() === 2, "both elapsed timers advance while pending");
  check(await page.getByRole("button", { name: "Comparing…", exact: true }).isDisabled(), "run button communicates pending state");
  await page.evaluate(() => window.finishArenaBaseline());
  await page.getByText("First lane finished.", { exact: true }).waitFor();
  check((await page.locator(".baseline .lane-status").textContent()).includes("1 fixture call returned"), "finished lane displays its outcome immediately");
  check((await page.locator(".integrated .lane-status").textContent()).includes("Calling a fixture tool"), "other lane stays active after first finishes");
  await page.evaluate(() => window.finishArenaBaseline(true));
  await page.locator(".run-inspector > summary").click();
  await page.getByRole("tab", { name: "Tool activity" }).click();
  check((await page.locator(".trace-lane").first().textContent()).includes("No fixture calls recorded."), "finished zero-call lane does not wait for sibling trace");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  check((await page.locator(".integrated .lane-status").textContent()).includes("Run stopped"), "cancel removes stale running state");
  check(await page.locator(".activity-dot").count() === 0, "cancel clears activity indicators");
  check(await page.getByText("First lane finished.", { exact: true }).isVisible(), "cancel preserves completed lane result");
  check((await page.locator(".trace-lane").last().textContent()).includes("call count is unknown"), "cancelled missing trace is not counted as zero calls");
  return { checks, count: checks.length, providerCalls: 0 };
}
