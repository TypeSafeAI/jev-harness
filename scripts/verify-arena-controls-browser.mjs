/** Synthetic response and credential; no live provider or CLI requests. */
export async function verifyArenaControls(page, baseURL, screenshotDir) {
  const checks = [], requests = [];
  let failRequest = false;
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  const historyKey = "jev-arena-history-v1", keyStorage = "typesafe-api-key-override", credential = "synthetic-browser-credential";
  await page.route("**/api/arena", route => {
    requests.push({ headers: route.request().headers(), body: route.request().postData() });
    if (failRequest) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic routing failure" }) });
    const result = { status: "completed", answer: "A synthetic answer remains available.", durationMs: 1000, inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, toolCallCount: 0, traceTruncated: false, toolCalls: [], error: null };
    const events = [{ type: "usage", attempted: true, measurement: { inputTokens: 20, outputTokens: 3, latencyMs: 2, requestBytes: 100, responseBytes: 20 } }, { type: "result", lane: "baseline", tools: ["read_file"], result }, { type: "result", lane: "integrated", tools: ["read_file"], result }, { type: "done" }];
    return route.fulfill({ contentType: "application/x-ndjson", body: events.map(e => JSON.stringify(e)).join("\n") + "\n" });
  });
  const run = async () => { await page.getByRole("button", { name: "Run comparison" }).click(); await page.waitForFunction(() => !document.querySelector(".arena-run-actions .primary").disabled); };
  try {
    await page.goto(baseURL); await page.getByRole("button", { name: "Run comparison" }).waitFor();
    check(await page.getByRole("radio").count() === 4, "four examples expose their intent before selection");
    await page.getByRole("radio", { name: "Read a tiny module", exact: true }).focus(); await page.keyboard.press("ArrowRight");
    check(await page.getByRole("radio", { name: "Propose a focused fix", exact: true }).isChecked() && (await page.locator(".arena-task-preview").textContent()).includes("never apply it"), "keyboard selection updates the task preview");
    await page.keyboard.press("ArrowLeft");
    check(await page.getByRole("radio", { name: "Read a tiny module", exact: true }).isChecked() && requests.length === 0, "selecting examples never starts a request");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const trigger = page.getByRole("button", { name: "How the comparison works" });
      const before = await page.locator(".arena-controls").evaluate(e => [e.offsetTop, e.offsetHeight, e.offsetWidth]);
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "How the comparison works" });
      check(await dialog.isVisible() && await dialog.evaluate(e => e.contains(document.activeElement)), `details open with focus inside the overlay at ${width}px`);
      check(JSON.stringify(before) === JSON.stringify(await page.locator(".arena-controls").evaluate(e => [e.offsetTop, e.offsetHeight, e.offsetWidth])), `opening details preserves the underlying layout at ${width}px`);
      check(await dialog.evaluate(e => { const b = e.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1 && b.height <= innerHeight + 1 && getComputedStyle(document.body).overflow === "hidden"; }), `drawer fits and locks background scrolling at ${width}px`);
      await page.locator("#key-settings").evaluate(e => e.focus());
      check(await dialog.evaluate(e => e.matches(":modal") && e.contains(document.activeElement)), `background controls are inert while details are open at ${width}px`);
      if (screenshotDir && width !== 320) await page.screenshot({ path: `${screenshotDir}/arena-overlay-${width}.png` });
      await page.keyboard.press("Escape");
      check(!await dialog.isVisible() && await trigger.evaluate(e => e === document.activeElement), `Escape closes details and restores focus at ${width}px`);
      if (screenshotDir && width !== 320) await page.screenshot({ path: `${screenshotDir}/arena-examples-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "How the comparison works" }).click();
    await page.mouse.click(10, 400);
    check(await page.locator(".detail-dialog[open]").count() === 0, "clicking the backdrop closes the drawer");
    await page.locator("#key-settings").click(); await page.locator("#api-key").fill(credential); await page.getByRole("button", { name: "Save override", exact: true }).click();
    await page.reload(); await page.getByRole("button", { name: "Settings, manual key override active", exact: true }).waitFor();
    await page.locator("#key-settings").click();
    check(await page.locator("#api-key").inputValue() === "", "saved credentials are never redisplayed after reload");
    await page.getByRole("button", { name: "Close settings" }).click();
    await run();
    check(requests[0].headers["x-typesafe-api-key"] === credential && !requests[0].body.includes(credential), "personal credentials travel only in the request header");
    check(await page.evaluate(([key, value]) => { const raw = localStorage.getItem(key); return JSON.parse(raw).runs.length === 1 && !raw.includes(value); }, [historyKey, credential]), "run snapshots exclude credentials");
    await page.evaluate(key => { window.originalArenaStorageWrite = Storage.prototype.setItem; Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException("Synthetic quota failure", "QuotaExceededError"); return window.originalArenaStorageWrite.call(this, name, value); }; }, historyKey);
    await run();
    check(await page.locator(".cache-error").first().isVisible() && await page.getByText("A synthetic answer remains available.", { exact: true }).count() === 2, "storage failure is visible and preserves the current results");
    check(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).runs.length === 1, historyKey), "quota failure preserves the previous cache");
    failRequest = true; await run();
    check(await page.getByText("Viewing unsaved evidence", { exact: false }).isVisible(), "failed unsaved runs retain an explicit in-memory result");
    await page.locator(".run-inspector > .detail-trigger").click();
    const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await download).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw);
    check(exported.status === "failed" && exported.startedAt && exported.finishedAt && exported.message === "Synthetic routing failure", "unsaved early failures can download their original status and timestamps");
    await page.getByRole("button", { name: "Close details" }).click();
    await page.evaluate(() => { Storage.prototype.setItem = window.originalArenaStorageWrite; });
    await page.locator("#usage-open").click();
    check(await page.locator("#usage-requests").textContent() === "2" && await page.locator("#usage-input").textContent() === "40", "usage dashboard records reported Jev usage independently");
    await page.locator("#usage-clear").click();
    check(await page.locator("#usage-requests").textContent() === "0" && await page.evaluate(key => JSON.parse(localStorage.getItem(key)).runs.length === 1, historyKey), "clearing usage preserves saved comparisons");
    await page.getByRole("button", { name: "Close usage dashboard" }).click();
    await page.getByRole("tab", { name: "History" }).click(); await page.getByRole("button", { name: "Clear local history", exact: true }).click(); await page.getByRole("button", { name: "Clear history", exact: true }).click();
    await page.getByText("Your next run starts the timeline", { exact: true }).waitFor();
    check(await page.evaluate(key => Boolean(localStorage.getItem(key)), keyStorage), "clearing comparisons preserves the API key");
    await page.locator("#key-settings").click(); await page.getByRole("button", { name: "Remove override", exact: true }).click();
    check(await page.evaluate(key => localStorage.getItem(key) === null, keyStorage), "removing a saved API key clears the browser override");
    return { checks, count: checks.length, providerCalls: 0, liveCliCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}

/** Malformed streams must release the request while retaining failed/partial evidence. */
export async function verifyArenaStreamFailures(page, baseURL) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  await page.addInitScript(() => {
    const original = window.fetch;
    window.arenaStreamFault = "malformed";
    window.fetch = async (input, init) => {
      if (input !== "/api/arena") return original(input, init);
      window.arenaStreamAborted = false;
      return new Response(new ReadableStream({ start(controller) {
        init.signal.addEventListener("abort", () => { window.arenaStreamAborted = true; controller.error(new DOMException("Aborted", "AbortError")); }, { once: true });
        if (window.arenaStreamFault === "partial") controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "result", lane: "baseline", tools: ["read_file"], result: { status: "completed", answer: "Evidence returned before stream failure.", durationMs: 1000, inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, toolCallCount: 0, traceTruncated: false, toolCalls: [], error: null } }) + "\n"));
        controller.enqueue(new TextEncoder().encode(window.arenaStreamFault === "oversized" ? "x".repeat(1_000_001) : "malformed-json\n"));
      } }), { headers: { "Content-Type": "application/x-ndjson" } });
    };
  });
  await page.goto(baseURL);
  for (const mode of ["malformed", "oversized", "partial"]) {
    await page.evaluate(mode => { window.arenaStreamFault = mode; }, mode);
    await page.getByRole("button", { name: "Run comparison" }).click();
    await page.waitForFunction(() => !document.querySelector(".arena-run-actions .primary").disabled);
    check(await page.evaluate(() => window.arenaStreamAborted), `${mode} stream aborts the live request`);
    const run = await page.evaluate(() => JSON.parse(localStorage.getItem("jev-arena-history-v1")).runs[0]);
    check(run.status === (mode === "partial" ? "partial" : "failed") && run.message.includes("connection failed"), `${mode} stream remains a failure rather than user cancellation`);
    if (mode === "partial") check(await page.getByText("Evidence returned before stream failure.", { exact: true }).isVisible(), "stream failure preserves the completed lane");
    else check((await page.locator("#arena-status").textContent()).startsWith("Failed run"), "failed requests have an explicit failed status");
  }
  return { checks, count: checks.length, providerCalls: 0, liveCliCalls: 0 };
}
