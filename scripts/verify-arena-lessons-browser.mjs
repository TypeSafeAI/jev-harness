/** Settled-run lessons, derived only from intercepted synthetic evidence. */
export async function verifyArenaLessons(page, baseURL, screenshotDir) {
  const checks = [], errors = []; let calls = 0, mode = "overhead";
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  page.on("pageerror", error => errors.push(error.message));
  const receipt = { schemaVersion: 1, catalog: [], request: { model: "jev-1.13.0", questionSetVersion: 1, intent: "Synthetic lesson test", untrustedDataNote: "Synthetic data", options: [] }, selectedIds: ["read_file"], reason: "Synthetic selection", source: "jev", outcome: "selected", execution: { applied: false }, evidence: { model: "jev-1.13.0", choice: "read_file", confidence: .9, probabilities: { read_file: .9, needs_clarification: .1 } }, policy: { topK: 1, confidenceFloor: .7, probabilityFloor: .2, relevanceWindow: .1, maxCostUnits: 10 } };
  const baseline = { status: "completed", answer: "Synthetic grounded answer.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 30, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  await page.route("**/api/arena", route => {
    calls++;
    if (mode === "failed") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic routing failure" }) });
    const integrated = { ...baseline, inputTokens: mode === "better" ? 500 : 900, durationMs: mode === "better" ? 500 : 800 };
    if (mode === "rejected") integrated.toolCalls = [{ ...baseline.toolCalls[0], status: "rejected" }];
    if (mode === "no_calls" || mode === "clarify") Object.assign(integrated, { toolCalls: [], toolCallCount: 0 });
    const events = [{ type: "usage", attempted: true, measurement: { inputTokens: mode === "unknown" ? null : 200, outputTokens: 5, latencyMs: 300, requestBytes: 1000, responseBytes: 200 } }, { type: "routing", receipt: mode === "clarify" ? { ...receipt, selectedIds: [], outcome: "needs_clarification" } : receipt }, { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result: baseline }];
    if (mode !== "partial") events.push({ type: "result", lane: "integrated", tools: mode === "clarify" ? [] : ["read_file"], result: integrated }, { type: "done" });
    return route.fulfill({ contentType: "application/x-ndjson", body: events.map(event => JSON.stringify(event)).join("\n") + "\n" });
  });
  const run = async () => { await page.getByRole("button", { name: "Run comparison" }).click(); await page.waitForFunction(() => !document.querySelector(".arena-run-actions .primary").disabled); };
  const open = () => page.locator(".arena-lessons > .detail-trigger").click();
  const headline = () => page.locator(".lesson-preview strong").textContent();
  try {
    await page.goto(baseURL);
    check(await page.locator(".arena-lessons").count() === 0, "lessons do not fabricate a result before a run");
    await run();
    check(await headline() === "More input · more measured time", "takeaway counts Jev overhead before describing the result");
    await open();
    check(await page.getByRole("dialog", { name: "Lessons from this run" }).isVisible(), "lessons open over the comparison in a named dialog");
    check(await page.locator(".lesson-evidence").getAttribute("open") === null, "detailed measurements stay behind progressive disclosure");
    await page.locator(".lesson-evidence > summary").click();
    check(await page.locator(".lesson-measurements").isVisible(), "reported measurements expand on demand");
    check((await page.locator(".lesson-measurements").textContent()).includes("1,100") && (await page.locator(".lesson-measurements").textContent()).includes("1.1 s"), "evidence shows integrated totals including routing");
    await page.locator(".lesson-evidence > summary").click();
    check(await page.locator(".lesson-recommendation").first().getAttribute("data-lesson") === "routing-overhead" && (await page.locator(".lesson-recommendation").first().textContent()).includes("Jev added 200"), "the first recommendation is grounded in the overhead measurement");
    check(await page.locator(".lesson-recommendation[open]").count() === 1, "only the priority recommendation starts expanded");
    await page.locator('.lesson-recommendation[data-lesson="repeat"] summary').focus(); await page.keyboard.press("Enter");
    check(await page.locator('.lesson-recommendation[data-lesson="repeat"]').getAttribute("open") !== null, "recommendations disclose their experiments by keyboard");
    await page.keyboard.press("Enter");
    check((await page.locator(".lesson-footer").textContent()).includes("not proven causes") && (await page.locator(".lesson-footer").textContent()).includes("nothing is applied automatically"), "the UI separates observations and proposed experiments");
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.locator(".arena-lessons dialog").evaluate(e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth; }), `lessons overlay fits ${width}px`);
      await page.locator(".arena-lessons .detail-dialog-body").evaluate(e => { e.scrollTop = 0; });
      if (screenshotDir && [390, 1440].includes(width)) await page.screenshot({ path: `${screenshotDir}/arena-lessons-${width}.png` });
    }
    await page.keyboard.press("Escape");
    check(await page.locator(".arena-lessons > .detail-trigger").evaluate(e => e === document.activeElement), "closing lessons restores focus to their preview");
    await page.reload(); await page.locator(".arena-lessons").waitFor();
    check(calls === 1 && await headline() === "More input · more measured time", "refresh derives the same lessons without another request");
    mode = "better"; await run();
    check(await headline() === "Less input and less measured time this run", "a better measured run has its own bounded takeaway");
    await open(); await page.getByRole("button", { name: "Compare repeated runs in History" }).click();
    check(await page.getByRole("tab", { name: "History" }).getAttribute("aria-selected") === "true" && await page.locator("dialog[open]").count() === 0, "history action closes the overlay and selects History");
    await page.locator(".history-run").last().click();
    check(calls === 2 && await headline() === "More input · more measured time", "reopening an older result restores that run’s lessons");
    await page.locator(".run-inspector > .detail-trigger").click();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await download).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw);
    check(exported.lessons.analysisVersion === 1 && exported.lessons.runId === exported.id && exported.lessons.measurements.input.delta === 100 && exported.lessons.qualityAssessed === false && exported.applied === false, "download binds versioned lessons to the original evidence without execution claims");
    await page.getByRole("button", { name: "Close details" }).click();
    for (const [nextMode, expected] of [["unknown", "Fill the measurement gaps"], ["partial", "Complete the comparison before optimizing"], ["rejected", "Resolve rejected calls before optimizing"], ["no_calls", "Check tool evidence before optimizing"], ["clarify", "Clarify the task before optimizing"], ["failed", "Complete the comparison before optimizing"]]) {
      mode = nextMode; await run(); check(await headline() === expected, `${mode} evidence gives the appropriate lesson`);
    }
    await open();
    check(await page.locator(".lesson-recommendation").first().getAttribute("data-lesson") === "routing-unavailable", "failed routing recommends restoring evidence before tuning performance");
    check(errors.length === 0, "no uncaught browser errors");
    return { checks, count: checks.length, providerCalls: 0, liveCliCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}
