/** Offline UI acceptance; synthetic NDJSON replaces both live providers. */
export async function verifyArena(page, baseURL) {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  let mode = "normal";
  const result = { status: "completed", answer: "The synthetic sum returns 5.", durationMs: 1000, inputTokens: 1000, cachedInputTokens: 300, outputTokens: 50, toolCallCount: 1, traceTruncated: false, toolCalls: [{ tool: "read_file", status: "returned", at: "2026-09-22T00:00:00Z" }], error: null };
  await page.route("**/api/arena", async route => {
    let events = [
      { type: "usage", attempted: true, measurement: { inputTokens: 100, outputTokens: 10, requestBytes: 400, responseBytes: 40, latencyMs: 200 } },
      { type: "routing", receipt: { selectedIds: ["read_file"], reason: "One fixture tool selected." } },
      { type: "result", lane: "baseline", tools: ["read_file", "propose_patch", "inspect_agent"], result },
      { type: "result", lane: "integrated", tools: ["read_file"], result: { ...result, inputTokens: mode === "unknown" ? null : 950, toolCallCount: mode === "zero" ? 0 : 1, toolCalls: mode === "zero" ? [] : result.toolCalls } },
      { type: "done" },
    ];
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
    const dl = page.waitForEvent("download"); await page.getByRole("button", { name: "Download comparison" }).click();
    const stream = await (await dl).createReadStream(); let raw = ""; for await (const chunk of stream) raw += chunk;
    const exported = JSON.parse(raw); check(exported.jevUsage.inputTokens === 100 && exported.applied === false, "export retains overhead and nonexecution");
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `arena fits ${width}px`);
      await page.locator(".arena-accounting > summary").click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `expanded accounting fits ${width}px`);
      await page.locator(".arena-accounting > summary").click();
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
    return { checks, count: checks.length, providerCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}
