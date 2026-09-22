/** Synthetic transport only. Run in a fresh browser context. */
export async function verifyArenaHistory(page, baseURL, screenshotDir) {
  const checks = [], errors = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  page.on("pageerror", error => errors.push(error.message));
  let calls = 0, mode = "normal";
  const key = "jev-arena-history-v1";
  const baseResult = { status: "completed", answer: "The synthetic sum returns **5**. No code changed.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 300, outputTokens: 40, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  const receipt = { schemaVersion: 1, catalog: [], request: { model: "jev-1.13.0", questionSetVersion: 1, intent: "Synthetic test", untrustedDataNote: "Synthetic test data", options: [] }, selectedIds: ["read_file"], reason: "Synthetic selection evidence.", source: "jev", outcome: "selected", execution: { applied: false }, evidence: { model: "jev-1.13.0", choice: "read_file", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } }, policy: { topK: 1, confidenceFloor: .7, probabilityFloor: .2, relevanceWindow: .1, maxCostUnits: 10 } };
  await page.route("**/api/arena", async route => {
    calls++;
    const result = { ...baseResult, inputTokens: 1000 + calls * 100, durationMs: 1000 + calls * 100 };
    const events = [
      { type: "usage", attempted: true, measurement: { inputTokens: mode === "unknown" ? null : 200, outputTokens: 10, latencyMs: 200, requestBytes: 1000, responseBytes: 200 } },
      { type: "routing", receipt },
      { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result },
      { type: "result", lane: "integrated", tools: ["read_file"], result: { ...result, inputTokens: 800 + calls * 50, durationMs: 900 + calls * 50 } },
      { type: "done" },
    ];
    await route.fulfill({ contentType: "application/x-ndjson", body: (mode === "partial" ? events.slice(0, 3) : events).map(event => JSON.stringify(event)).join("\n") + "\n" });
  });
  const run = async () => { const response = page.waitForResponse(r => r.url().endsWith("/api/arena")); await page.getByRole("button", { name: "Run comparison" }).click(); await response; await page.waitForFunction(() => !document.querySelector(".arena-run-actions .primary").disabled); };
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"runs":[]}').runs, key);
  try {
    await page.goto(baseURL);
    check(await page.getByRole("heading", { name: "One task. Two tool menus." }).isVisible(), "root is the agent arena");
    check(await page.getByRole("link", { name: "Routing room" }).count() === 0 && await page.getByRole("link", { name: "Examples", exact: true }).count() === 0, "other page navigation is removed");
    await page.getByRole("tab", { name: "History" }).click();
    check(await page.getByText("Your next run starts the timeline", { exact: true }).isVisible(), "empty history gives a clear next action");
    await page.getByRole("tab", { name: "History" }).focus(); await page.keyboard.press("Home");
    check(await page.getByRole("tab", { name: "Compare", exact: true }).getAttribute("aria-selected") === "true", "workspace tabs support keyboard navigation");
    await run();
    check((await stored()).length === 1, "completed comparison is saved automatically");
    check(await page.locator(".saved-run-banner").isVisible(), "saved evidence has a timestamp and provenance banner");
    await page.getByRole("tab", { name: "History" }).click();
    check(await page.getByText("One result is a starting point.", { exact: false }).isVisible(), "one run is not presented as a trend");
    await run();
    check((await stored()).length === 2, "repeated runs accumulate without overwriting previous results");
    await page.reload();
    await page.locator(".saved-run-banner").waitFor();
    check(calls === 2, "refresh restores local evidence without a provider request");
    await page.getByRole("tab", { name: "History" }).click();
    check(await page.locator(".history-run").count() === 2 && await page.locator(".trend-integrated circle").count() === 2, "history pairs saved rows with plotted observations");
    check((await page.locator(".history-run").first().getAttribute("aria-label")).includes("Without Jev: 1,200 input tokens. With Jev including routing: 1,100 input tokens."), "history rows expose labeled paired values to assistive technology");
    check((await page.locator(".history-stats").textContent()).includes("1,075"), "history input medians include Jev overhead");
    await page.getByRole("button", { name: "Time", exact: true }).click();
    check((await page.locator(".history-stats").textContent()).includes("1.2 s"), "time series includes routing duration");
    await page.locator(".history-run").last().click();
    check((await page.locator(".baseline .lane-metrics").textContent()).includes("1,100"), "opening an earlier run restores its original metrics");
    check(calls === 2, "opening history never reruns the agents");
    await page.locator(".run-inspector > .detail-trigger").click();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await download).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw);
    check(exported.startedAt && exported.finishedAt && exported.lanes.baseline.result.inputTokens === 1100 && exported.applied === false, "saved-run download preserves timestamp, original evidence and nonexecution");
    await page.getByRole("button", { name: "Close details" }).click();
    await page.getByRole("radio", { name: "Inspect a timeout", exact: true }).check();
    await run();
    await page.getByRole("tab", { name: "History" }).click();
    check(await page.locator(".history-run").count() === 1, "different tasks have separate histories and trends");
    await page.getByRole("radio", { name: "Read a tiny module", exact: true }).check();
    mode = "unknown"; await run();
    mode = "partial"; await run();
    await page.getByRole("tab", { name: "History" }).click();
    await page.getByRole("button", { name: "Input tokens", exact: true }).click();
    check(await page.locator(".history-run").count() === 4, "unknown and partial runs remain inspectable");
    check(await page.locator(".trend-integrated circle").count() === 2, "unknown and partial values do not become zero-valued chart points");
    check((await page.locator(".history-chart figcaption").textContent()).includes("2 runs are excluded"), "excluded observations are counted explicitly");
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `history fits ${width}px`);
      if (screenshotDir && [390, 1440].includes(width)) await page.screenshot({ path: `${screenshotDir}/arena-history-${width}.png`, fullPage: true });
      await page.getByRole("tab", { name: "Compare", exact: true }).click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `single arena comparison fits ${width}px`);
      await page.getByRole("tab", { name: "History" }).click();
    }
    // Another tab writes the same origin; no fabricated StorageEvent is needed.
    const other = await page.context().newPage();
    await other.goto(baseURL);
    await other.evaluate(key => { const data = JSON.parse(localStorage.getItem(key)); data.runs.unshift({ ...data.runs[0], id: "cross-tab-copy", finishedAt: new Date().toISOString() }); localStorage.setItem(key, JSON.stringify(data)); }, key);
    await page.waitForFunction(() => document.querySelectorAll(".history-run").length === 5);
    check(await page.locator(".history-run").count() === 5 && (await page.getByRole("tab", { name: "History" }).textContent()).includes("6"), "history UI synchronizes across tabs");
    await other.close();
    await page.getByRole("button", { name: "Clear local history", exact: true }).click();
    await page.getByRole("button", { name: "Keep history", exact: true }).click();
    check((await stored()).length === 6, "clear-history cancellation preserves the cache");
    await page.getByRole("button", { name: "Clear local history", exact: true }).click();
    await page.getByRole("button", { name: "Clear history", exact: true }).click();
    await page.getByText("Your next run starts the timeline", { exact: true }).waitFor();
    check((await stored()).length === 0, "confirmed clearing removes cached results");
    await page.reload();
    check(await page.locator(".arena-welcome").isVisible(), "cleared history stays empty after reload");
    const old = await page.goto(baseURL + "/arena");
    check(page.url().replace(/\/$/, "") === baseURL.replace(/\/$/, "") && old.status() === 200, "old arena URL redirects to the sole interface");
    const removed = await page.goto(baseURL + "/examples");
    check(removed.status() === 404, "removed examples page is no longer served");
    check(errors.length === 0, "no uncaught browser errors");
    return { checks, count: checks.length, providerCalls: 0, liveCliCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}
