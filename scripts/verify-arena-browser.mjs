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
    const run = async () => {
      const response = page.waitForResponse(response => response.url().endsWith("/api/arena"));
      await page.getByRole("button", { name: "Run comparison" }).click();
      await response;
      await page.waitForFunction(() => !document.querySelector(".arena-controls button.primary").disabled);
    };
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(await page.locator(".activity-dot").evaluateAll(dots => dots.every(dot => getComputedStyle(dot).animationName === "none")), "pending indicators stop animating with reduced motion");
  check((await page.locator(".integrated .lane-metrics dd strong").allTextContents()).slice(1).every(value => value === "Pending"), "running metrics show pending rather than zero");
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
  check((await page.locator(".integrated .lane-metrics dd strong").allTextContents()).slice(1).every(value => value === "Unknown"), "cancelled missing lane metrics remain unknown");
  check(await page.getByText("First lane finished.", { exact: true }).isVisible(), "cancel preserves completed lane result");
  check((await page.locator(".trace-lane").last().textContent()).includes("call count is unknown"), "cancelled missing trace is not counted as zero calls");
  return { checks, count: checks.length, providerCalls: 0 };
}

/** Comparison presentation and edge states, with deterministic offline responses. */
export async function verifyArenaClarity(page, baseURL, screenshotDir) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  let mode = "normal";
  const baseAnswer = "`requestTimeoutMs = 3000` sets the request timeout to **3 seconds**. `idleTimeoutMs = 30000` sets the idle timeout to **30 seconds**.\n\nThe config alone doesn’t show how these values are applied. Nothing was changed.";
  const longAnswer = baseAnswer + "\n\n" + "This is synthetic explanatory text for testing progressive disclosure. ".repeat(20) + "\n\nFinal caveat: the application code was not inspected.";
  const result = { status: "completed", answer: baseAnswer, durationMs: 16300, inputTokens: 30194, cachedInputTokens: 10000, outputTokens: 90, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "inspect_agent", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  await page.route("**/api/arena", route => {
    const integrated = { ...result, answer: "`inspect_agent` found a request timeout of **3 seconds** and an idle timeout of **30 seconds**. Nothing changed.", inputTokens: 29490, durationMs: 34500 };
    if (mode === "long") integrated.answer = longAnswer;
    if (mode === "multiline") integrated.answer = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join("\n");
    if (mode === "unsafe") integrated.answer = '<img src=x onerror="window.arenaInjected=true"> **Plain text** [link](javascript:alert(1))';
    if (mode === "failed") Object.assign(integrated, { status: "failed", error: "The CLI stopped before returning its final answer.", answer: "Partial answer retained.", inputTokens: null });
    if (mode === "cancelled") Object.assign(integrated, { status: "cancelled", error: "Run cancelled.", answer: "", inputTokens: null, toolCallCount: 0, toolCalls: [] });
    if (mode === "rejected") integrated.toolCalls = [{ ...result.toolCalls[0], status: "rejected" }];
    if (mode === "truncated") Object.assign(integrated, { toolCallCount: 103, traceTruncated: true, toolCalls: Array.from({ length: 100 }, () => result.toolCalls[0]) });
    if (mode === "zero") Object.assign(integrated, { toolCallCount: 0, toolCalls: [] });
    const events = [
      { type: "usage", attempted: true, measurement: mode === "unknown" ? null : { inputTokens: 800, outputTokens: 10, requestBytes: 1000, responseBytes: 200, latencyMs: 500 } },
      { type: "routing", receipt: { selectedIds: mode === "zero" ? [] : ["inspect_agent"] } },
      { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result },
      { type: "result", lane: "integrated", tools: mode === "zero" ? [] : ["inspect_agent"], result: integrated },
      { type: "done" },
    ];
    return route.fulfill({ contentType: "application/x-ndjson", body: events.map(event => JSON.stringify(event)).join("\n") + "\n" });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL + "/arena");
    const run = async () => {
      const response = page.waitForResponse(response => response.url().endsWith("/api/arena"));
      await page.getByRole("button", { name: "Run comparison" }).click();
      await response;
      await page.waitForFunction(() => !document.querySelector(".arena-controls button.primary").disabled);
    };
    const values = () => page.locator(".integrated .lane-metrics dd strong").allTextContents();
    await run();
    check(JSON.stringify(await values()) === JSON.stringify(["1", "30,290", "35.0 s"]), "headline metrics include Jev input and routing time");
    check(await page.getByText("96 more tokens", { exact: true }).isVisible(), "routing overhead can reverse apparent CLI savings");
    check(await page.getByText("18.7 s longer with Jev · includes routing", { exact: true }).isVisible(), "comparison exposes the latency tradeoff without declaring a winner");
    check(await page.getByText("29,490 CLI + 800 Jev", { exact: true }).isVisible(), "total input has a visible component breakdown");
    check(await page.locator(".lane-activity:not([open])").count() === 2, "tool detail starts collapsed");
    check(await page.locator(".integrated .activity-summary").textContent() === "Inspect fixture", "collapsed activity identifies the actual tool");
    check(await page.locator(".baseline .arena-answer p").count() === 2, "answer paragraphs preserve qualifications with readable spacing");
    for (const width of [320, 390, 600, 768, 900, 1024, 1280, 1440, 1920, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `comparison fits ${width}px`);
      if (width > 900) {
        check(await page.evaluate(() => [".lane-metrics", ".lane-answer", ".lane-activity"].every(selector => {
          const rows = [...document.querySelectorAll(`.arena-lane ${selector}`)].map(element => element.getBoundingClientRect().top);
          return Math.abs(rows[0] - rows[1]) < 1;
        })), `paired metrics, answers and disclosures align at ${width}px`);
      }
      if (screenshotDir && [390, 1440, 1920].includes(width)) await page.locator(".arena-lanes").screenshot({ path: `${screenshotDir}/arena-clarity-${width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const disclosure = page.locator(".integrated .lane-activity > summary");
    await disclosure.focus(); await page.keyboard.press("Enter");
    check(await page.locator(".integrated .lane-activity").getAttribute("open") !== null, "tool disclosure opens with keyboard");
    check(await page.locator(".integrated .call-chip").textContent() === "Inspect fixturereturned", "expanded activity distinguishes call status from availability");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "expanded tool detail fits mobile");
    await page.keyboard.press("Enter");
    check(await page.locator(".integrated .lane-activity").getAttribute("open") === null, "tool disclosure closes with keyboard");
    mode = "long"; await run();
    check(await page.getByText("Preview", { exact: true }).isVisible(), "long answer is explicitly labeled a preview");
    check(!(await page.locator(".integrated .arena-answer").textContent()).includes("Final caveat"), "long answer is progressively disclosed");
    const expand = page.getByRole("button", { name: "Read full answer" });
    await expand.focus(); await page.keyboard.press("Enter");
    check(await page.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded") === "true", "answer expansion announces its state");
    check((await page.locator(".integrated .arena-answer").textContent()).includes("Final caveat"), "full answer retains the final qualification");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "expanded long answer fits mobile without nested scrolling");
    await page.getByRole("button", { name: "Show less" }).click();
    check(await page.getByRole("button", { name: "Read full answer" }).isVisible(), "long answer collapses again");
    mode = "multiline"; await run();
    check(await page.getByText("Preview", { exact: true }).isVisible() && !(await page.locator(".integrated .arena-answer").textContent()).includes("Line 9"), "many short lines are also bounded in the answer preview");
    await page.getByRole("button", { name: "Read full answer" }).click();
    check((await page.locator(".integrated .arena-answer").textContent()).includes("Line 20"), "multiline answer expands without losing content");
    mode = "normal"; await run();
    check(await page.getByRole("button", { name: "Read full answer" }).count() === 0, "new short answer clears the old disclosure state");
    mode = "unknown"; await run();
    check(JSON.stringify(await values()) === JSON.stringify(["1", "Unknown", "Unknown"]), "missing Jev measurement keeps combined input and time unknown");
    check(await page.locator(".arena-time-delta").count() === 0, "unknown timing suppresses the latency comparison");
    mode = "failed"; await run();
    check(await page.getByText("Comparison incomplete", { exact: true }).isVisible(), "failed lane suppresses the comparison headline");
    check(await page.getByText("Partial answer retained.", { exact: true }).isVisible() && await page.locator(".lane-error").isVisible(), "partial answer and failure reason remain visible together");
    mode = "cancelled"; await run();
    check((await page.locator(".integrated .lane-status").textContent()).includes("Run cancelled"), "cancelled results have a distinct outcome");
    mode = "rejected"; await run();
    check((await page.locator(".integrated .lane-status").textContent()).includes("rejected"), "rejected calls do not look like returned results");
    mode = "truncated"; await run();
    check((await page.locator(".integrated .activity-summary").textContent()).includes("partial trace"), "truncated activity is labeled in its collapsed summary");
    mode = "zero"; await run();
    check((await values())[0] === "0" && (await page.locator(".integrated .lane-status").textContent()).includes("No fixture call observed"), "zero exposure and zero calls stay explicit");
    mode = "unsafe"; await run();
    check(await page.locator(".arena-answer img, .arena-answer a").count() === 0 && !await page.evaluate(() => window.arenaInjected), "model output remains inert text with only safe inline formatting");
    return { checks, count: checks.length, providerCalls: 0, cliCalls: 0, fixture: "synthetic presentation data; not a benchmark", humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}
