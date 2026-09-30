function browserReceipt(selectedIds = ["read_file"]) {
  return { schemaVersion: 1, catalog: [], request: { model: "jev-1.13.0", questionSetVersion: 1, intent: "Synthetic test", untrustedDataNote: "Synthetic test data", options: [] }, selectedIds, reason: "One fixture tool selected.", source: "jev", outcome: selectedIds.length ? "selected" : "needs_clarification", execution: { applied: false }, evidence: { model: "jev-1.13.0", choice: selectedIds[0] ?? "needs_clarification", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } }, policy: { topK: 1, confidenceFloor: .6, probabilityFloor: .2, relevanceWindow: .1, maxCostUnits: 10 } };
}
/** Offline UI acceptance; synthetic NDJSON replaces both live providers. */
export async function verifyArena(page, baseURL) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  let mode = "normal";
  const result = { status: "completed", answer: "The synthetic sum returns 5.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 300, outputTokens: 50, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  await page.route("**/api/arena", async route => {
    let events = [
      { type: "usage", attempted: true, measurement: { inputTokens: 100, outputTokens: 10, requestBytes: 400, responseBytes: 40, latencyMs: 200 } },
      { type: "routing", receipt: browserReceipt() },
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
    await page.locator(".run-inspector > .detail-trigger").click();
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
    await page.getByRole("button", { name: "Close details" }).click();
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `arena fits ${width}px`);
      await page.locator(".run-inspector > .detail-trigger").click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overlay accounting fits ${width}px`);
      await page.getByRole("button", { name: "Close details" }).click();
    }
    mode = "zero"; await run();
    check(await page.getByText("No fixture call observed", { exact: true }).isVisible(), "completed CLI with zero calls is not implied execution");
    mode = "unknown"; await run();
    check(await page.getByText("Usage incomplete", { exact: true }).isVisible(), "unknown usage never becomes savings");
    mode = "eof"; await run();
    check((await page.locator(".saved-run-message").textContent()).includes("partial"), "early EOF shows partial status");
    await page.getByRole("button", { name: "Usage · 4", exact: true }).click();
    check((await page.locator("#usage-unknown").textContent()).includes("1 requests"), "early EOF records unknown usage");
    await page.getByRole("button", { name: "Close usage dashboard" }).click();
    mode = "skipped"; await run();
    check(await page.getByRole("button", { name: "Usage · 4", exact: true }).isVisible(), "explicit skipped request does not add usage");
    mode = "proposal"; await run();
    await page.locator(".run-inspector > .detail-trigger").click();
    await page.getByRole("tab", { name: "Tool activity" }).click();
    await page.getByText("Inspect recorded proposal", { exact: true }).first().click();
    check((await page.locator(".recorded-proposal pre").first().textContent()).includes("+ after"), "recorded proposals expose their pending diff in the inspector");
    const proposalDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const proposalStream = await (await proposalDownload).createReadStream(); let proposalJson = ""; for await (const chunk of proposalStream) proposalJson += chunk;
    check(JSON.parse(proposalJson).lanes.baseline.result.toolCalls[0].proposal.applied === false, "proposal export preserves nonexecution and recorded data");
    return { checks, count: checks.length, providerCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}

/** Prerequisite menus must survive completion, history reload and export. */
export async function verifyArenaBundle(page, baseURL, screenshotDir) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const at = "2026-09-24T00:00:00Z";
  let missingReceipt = false;
  const result = { status: "completed", answer: "Read the synthetic helper and recorded a pending proposal. No patch was applied.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 50, toolCallCount: 2, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at }, { tool: "propose_patch", status: "returned", at }], error: null };
  await page.route("**/api/arena", route => route.fulfill({ contentType: "application/x-ndjson", body: [
    { type: "usage", attempted: true, measurement: { inputTokens: 100, outputTokens: 10, requestBytes: 400, responseBytes: 40, latencyMs: 200 } },
    { type: "routing", receipt: missingReceipt ? null : browserReceipt(["propose_patch"]) },
    { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result },
    { type: "result", lane: "integrated", tools: ["read_file", "propose_patch"], result },
    { type: "done" },
  ].map(event => JSON.stringify(event)).join("\n") + "\n" }));
  try {
    await page.goto(baseURL);
    await page.getByRole("button", { name: "Run comparison" }).click();
    await page.getByText("3 tools → 2 exposed with Jev", { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector(".arena-controls button.primary").disabled);
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `bundle comparison fits ${width}px`);
      check(await page.getByText("Selected + prerequisites", { exact: true }).isVisible(), `bundle exposure clear at ${width}px`);
      if (screenshotDir && [390, 1440].includes(width)) await page.screenshot({ path: `${screenshotDir}/arena-bundle-${width}.png`, fullPage: true });
    }
    await page.reload();
    await page.getByText("3 tools → 2 exposed with Jev", { exact: true }).waitFor();
    check((await page.locator(".integrated .lane-metrics dd strong").first().textContent()) === "2", "history keeps actual bundled exposure");
    await page.locator(".run-inspector > .detail-trigger").click();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await download).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw);
    check(JSON.stringify(exported.receipt.selectedIds) === JSON.stringify(["propose_patch"]), "download preserves Jev root selection");
    check(JSON.stringify(exported.lanes.integrated.tools) === JSON.stringify(["read_file", "propose_patch"]), "download records the host's expanded menu");
    check(exported.setupVersion === 7 && exported.applied === false, "new setup is identifiable and remains nonexecuting");
    await page.getByRole("button", { name: "Close details" }).click();
    missingReceipt = true;
    await page.getByRole("button", { name: "Run comparison" }).click();
    await page.getByText("Reported tool menu", { exact: true }).waitFor();
    check(await page.getByText("Selected + prerequisites", { exact: true }).count() === 0, "missing routing evidence never implies prerequisite expansion");
    check((await page.locator(".integrated .lane-metrics dd strong").first().textContent()) === "2", "reported exposure remains visible without a routing receipt");
    return { checks, count: checks.length, providerCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}

/** Held streams verify visible progress/cancellation without a CLI or provider. Use a fresh page. */
export async function verifyArenaProgress(page, baseURL, withPrerequisites = false) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  await page.addInitScript(({ receipt, withPrerequisites }) => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      if (input !== "/api/arena") return original(input, init);
      return new Response(new ReadableStream({ start(controller) {
        const emit = event => controller.enqueue(new TextEncoder().encode(JSON.stringify(event) + "\n"));
        emit({ type: "usage", attempted: true, measurement: { inputTokens: 20, outputTokens: 3, latencyMs: 2, requestBytes: 100, responseBytes: 20 } });
        emit({ type: "routing", receipt });
        emit({ type: "stage", value: "Both agents are running in parallel." });
        if (withPrerequisites) {
          emit({ type: "lane", lane: "baseline", phase: "starting", tools: ["read_file", "propose_patch", "inspect_agent"] });
          emit({ type: "lane", lane: "integrated", phase: "starting", tools: ["read_file", "propose_patch"] });
        }
        emit({ type: "lane", lane: "baseline", phase: "working" });
        emit({ type: "lane", lane: "integrated", phase: "calling" });
        window.finishArenaBaseline = (zero = false) => emit({ type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result: { status: "completed", answer: "First lane finished.", durationMs: 1000, inputTokens: 100, outputTokens: 10, cachedInputTokens: 0, toolCallCount: zero ? 0 : 1, traceTruncated: false, toolCalls: zero ? [] : [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null } });
        init.signal.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      } }), { headers: { "Content-Type": "application/x-ndjson" } });
    };
  }, { receipt: browserReceipt(withPrerequisites ? ["propose_patch"] : ["read_file"]), withPrerequisites });
  await page.goto(baseURL + "/arena");
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page.getByText("Both agents are running in parallel.", { exact: true }).waitFor();
  check((await page.locator(".baseline .lane-status").textContent()).includes("Agent is working"), "baseline shows independent working state");
  check((await page.locator(".integrated .lane-status").textContent()).includes("Calling a fixture tool"), "integrated shows independent tool activity");
  if (withPrerequisites) {
    check(await page.getByText("3 tools → 2 exposed with Jev", { exact: true }).isVisible(), "pending exposure includes prerequisites after later phase events");
    check((await page.locator(".integrated .lane-metrics dd strong").first().textContent()) === "2", "pending integrated metric reports actual host menu");
    check(await page.getByText("Selected + prerequisites", { exact: true }).isVisible(), "dependency exposure is distinguished from routed selection");
  }
  await page.waitForFunction(() => [...document.querySelectorAll(".lane-status small")].every(e => parseInt(e.textContent) >= 1));
  check(await page.locator(".lane-status small").count() === 2, "both elapsed timers advance while pending");
  check(await page.getByRole("button", { name: "Comparing…", exact: true }).isDisabled(), "run button communicates pending state");
  check(await page.locator(".arena-lessons").count() === 0, "pending runs do not show premature lessons");
  await page.getByRole("tab", { name: "Integrate", exact: true }).click();
  check(await page.getByText("A comparison is running.", { exact: false }).isVisible(), "integration keeps an active comparison discoverable");
  await page.getByRole("button", { name: "View progress", exact: true }).click();
  check(await page.getByRole("button", { name: "Cancel", exact: true }).isVisible(), "returning from integration preserves progress and cancellation");
  check(await page.getByRole("radio", { name: "Read a tiny module", exact: true }).isDisabled(), "examples cannot change during a run");
  const other = await page.context().newPage(); await other.goto(baseURL);
  await other.evaluate(() => localStorage.setItem("jev-arena-history-v1", JSON.stringify({ version: 1, runs: [] })));
  await other.close();
  check(await page.getByRole("button", { name: "Comparing…", exact: true }).isDisabled() && await page.getByText("Both agents are running in parallel.", { exact: true }).isVisible(), "history storage events do not cancel an active comparison");
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(await page.locator(".activity-dot").evaluateAll(dots => dots.every(dot => getComputedStyle(dot).animationName === "none")), "pending indicators stop animating with reduced motion");
  check((await page.locator(".integrated .lane-metrics dd strong").allTextContents()).slice(1).every(value => value === "Pending"), "running metrics show pending rather than zero");
  await page.evaluate(() => window.finishArenaBaseline());
  await page.getByText("First lane finished.", { exact: true }).waitFor();
  check((await page.locator(".baseline .lane-status").textContent()).includes("1 fixture call returned"), "finished lane displays its outcome immediately");
  check((await page.locator(".integrated .lane-status").textContent()).includes("Calling a fixture tool"), "other lane stays active after first finishes");
  await page.evaluate(() => window.finishArenaBaseline(true));
  await page.locator(".run-inspector > .detail-trigger").click();
  await page.getByRole("tab", { name: "Tool activity" }).click();
  check((await page.locator(".trace-lane").first().textContent()).includes("No fixture calls recorded."), "finished zero-call lane does not wait for sibling trace");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  check((await page.locator(".integrated .lane-status").textContent()).includes("Run stopped"), "cancel removes stale running state");
  check(await page.locator(".activity-dot").count() === 0, "cancel clears activity indicators");
  check((await page.locator(".integrated .lane-metrics dd strong").allTextContents()).slice(1).every(value => value === "Unknown"), "cancelled missing lane metrics remain unknown");
  check(await page.getByText("First lane finished.", { exact: true }).isVisible(), "cancel preserves completed lane result");
  await page.locator(".run-inspector > .detail-trigger").click();
  check((await page.locator(".trace-lane").last().textContent()).includes("call count is unknown"), "cancelled missing trace is not counted as zero calls");
  await page.getByRole("button", { name: "Close details" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("jev-arena-history-v1")).runs.length === 1);
  check(await page.evaluate(() => { const run = JSON.parse(localStorage.getItem("jev-arena-history-v1")).runs[0]; return run.status === "cancelled" && run.lanes.baseline.result.answer === "First lane finished." && !run.lanes.integrated; }), "cancelled run saves the returned evidence exactly once");
  if (withPrerequisites) {
    await page.getByRole("tab", { name: /^History/ }).click();
    await page.locator(".history-run").first().click();
    check(await page.getByText("1 selected · tool access not reported", { exact: true }).isVisible(), "reopening an incomplete run does not reuse transient tool exposure");
    check((await page.locator(".integrated .lane-metrics dd strong").first().textContent()) === "—", "missing historical lane does not inherit another run's menu");
  }
  await page.getByRole("button", { name: "Run comparison" }).click();
  await page.getByText("Both agents are running in parallel.", { exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event("jev-key-change")));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("jev-arena-history-v1")).runs.length === 2);
  check(await page.locator(".arena-welcome").isVisible() && await page.getByRole("button", { name: "Run comparison" }).isEnabled(), "key changes abort the run and clear stale visible results");
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("jev-arena-history-v1")).runs.every(run => run.status === "cancelled")), "key-change cancellation is retained without manufacturing a complete comparison");
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
      { type: "routing", receipt: browserReceipt(mode === "zero" ? [] : ["inspect_agent"]) },
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
    check(await page.locator(".lane-activity dialog:not([open])").count() === 2, "tool detail starts collapsed");
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
    const disclosure = page.locator(".integrated .lane-activity > .detail-trigger");
    await disclosure.focus(); await page.keyboard.press("Enter");
    check(await page.locator(".integrated .lane-activity dialog").getAttribute("open") !== null, "tool disclosure opens with keyboard");
    check(await page.locator(".integrated .call-chip").textContent() === "Inspect fixturereturned", "expanded activity distinguishes call status from availability");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "expanded tool detail fits mobile");
    await page.keyboard.press("Escape");
    check(await page.locator(".integrated .lane-activity dialog").getAttribute("open") === null, "tool disclosure closes with keyboard");
    mode = "long"; await run();
    check(await page.getByText("Preview", { exact: true }).isVisible(), "long answer is explicitly labeled a preview");
    check(!(await page.locator(".integrated .lane-answer > .arena-answer").textContent()).includes("Final caveat"), "long answer is progressively disclosed");
    const expand = page.getByRole("button", { name: "Read full answer" });
    await expand.focus(); await page.keyboard.press("Enter");
    check(await page.getByRole("dialog", { name: "Agent answer", exact: true }).isVisible(), "full answer opens in an accessible dialog");
    check((await page.locator(".detail-dialog[open] .arena-answer").textContent()).includes("Final caveat"), "full answer retains the final qualification");
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "expanded long answer fits mobile without nested scrolling");
    await page.getByRole("button", { name: "Close details" }).click();
    check(await page.getByRole("button", { name: "Read full answer" }).isVisible(), "closing full answer preserves the preview");
    mode = "multiline"; await run();
    check(await page.getByText("Preview", { exact: true }).isVisible() && !(await page.locator(".integrated .lane-answer > .arena-answer").textContent()).includes("Line 9"), "many short lines are also bounded in the answer preview");
    await page.getByRole("button", { name: "Read full answer" }).click();
    check((await page.locator(".detail-dialog[open] .arena-answer").textContent()).includes("Line 20"), "multiline answer opens without losing content");
    await page.getByRole("button", { name: "Close details" }).click();
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
