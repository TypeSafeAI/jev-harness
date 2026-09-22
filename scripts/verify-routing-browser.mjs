/**
 * Optional browser acceptance check. Pass a Playwright Page from your existing
 * browser driver; this repository does not install a second test framework.
 * Start `pnpm demo 4187`, then await verifyRoutingDemo(page, baseURL).
 */
export async function verifyRoutingDemo(page, baseURL = "http://127.0.0.1:4187") {
  const checks = [];
  const errors = [];
  const requests = [];
  const onError = error => errors.push(error.message);
  const onConsole = message => { if (message.type() === "error") errors.push(message.text()); };
  const onRequest = request => requests.push(request.url());
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  const check = (condition, label) => { if (!condition) throw Error(label); checks.push(label); };
  const receipt = async () => JSON.parse(await page.locator("#receipt").textContent());
  const expectOutcome = async outcome => {
    await page.waitForFunction(expected => {
      const text = document.querySelector("#receipt")?.textContent;
      return text && JSON.parse(text).outcome === expected;
    }, outcome);
    check((await receipt()).outcome === outcome, `outcome: ${outcome}`);
  };
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL);
    await expectOutcome("selected");
    check(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme === "dark"), "dark mode is the default");
    check(await page.getByRole("checkbox", { name: "read_file", exact: true }).isHidden(), "tool controls are disclosed on demand");
    check(await page.locator("#decision").isHidden(), "routing evidence is disclosed on demand");
    check(await page.locator("#comparison").isHidden(), "comparison is disclosed on demand");
    check(await page.locator("#chat").isHidden(), "history is disclosed on demand");
    check(await page.getByRole("button", { name: "Download receipt" }).isHidden(), "receipt export is disclosed on demand");
    check((await receipt()).selectedIds.join() === "read_file", "lower-cost eligible tool selected");
    check((await page.locator("#comparison-takeaway").textContent()).includes("51 fewer estimated input tokens (14%)"), "comparison headline includes router input overhead");
    check((await page.locator("#routed-explanation").textContent()).includes("103 for the task and 1 selected schema + 221 for routing"), "comparison explains both routed inputs");
    check((await page.locator("#output-overhead").textContent()).includes("42 output tokens"), "router output is separately disclosed");
    await page.getByRole("radio", { name: "Batteries included" }).check();
    check((await page.locator("#flow-loaded").textContent()) === "3 schemas", "full mode loads all schemas");
    await page.getByRole("radio", { name: "Lean", exact: true }).check();
    check((await page.locator("#transition").textContent()).includes("Evicted: propose_patch, inspect_agent"), "lean mode evicts extra schemas");
    await page.getByText("Tools & policy", { exact: true }).click();
    await page.getByRole("checkbox", { name: "read_file", exact: true }).uncheck();
    check((await receipt()).selectedIds.join() === "inspect_agent", "availability recomputes selection");
    await page.getByRole("checkbox", { name: "inspect_agent", exact: true }).uncheck();
    await expectOutcome("needs_clarification");
    await page.getByRole("checkbox", { name: "propose_patch", exact: true }).uncheck();
    await expectOutcome("no_match");
    check((await page.locator("#comparison-takeaway").textContent()).includes("no equivalent completed task"), "no selection is not presented as task savings");
    check((await page.locator("#flow-loaded").textContent()) === "0 schemas", "empty availability loads nothing");
    for (const id of ["read_file", "propose_patch", "inspect_agent"]) await page.getByRole("checkbox", { name: id, exact: true }).check();
    await page.getByLabel("Cost limit per tool").fill("0");
    await page.getByLabel("Cost limit per tool").press("Tab");
    await expectOutcome("no_match");
    await page.getByLabel("Cost limit per tool").fill("10");
    await page.getByLabel("Cost limit per tool").press("Tab");
    await page.getByLabel("Maximum tools").selectOption("2");
    check((await receipt()).selectedIds.join() === "read_file,inspect_agent", "top-k loads eligible descriptors");
    await page.getByLabel("Maximum tools").selectOption("1");
    for (const [id, outcome] of [["patch", "selected"], ["inspect", "selected"], ["ambiguous", "needs_clarification"], ["uncertain", "needs_clarification"], ["outage", "unavailable"], ["invalid", "unavailable"]]) {
      await page.getByLabel("Try a scenario").selectOption(id);
      await expectOutcome(outcome);
      check((await receipt()).execution.applied === false, `${id}: nothing executes`);
    }
    await page.getByLabel("Task message", { exact: true }).fill('<img src=x onerror="alert(1)">');
    check((await page.locator("#status").textContent()).includes("No current selection"), "editing clears accessible status");
    check(await page.locator("#download").isDisabled(), "editing disables stale receipt download");
    await page.getByRole("button", { name: "Route this task" }).click();
    await expectOutcome("needs_clarification");
    check(await page.locator("#chat img").count() === 0, "custom text is rendered as text");
    await page.getByText("Inspect routing evidence and receipt", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download receipt" }).click();
    const download = await downloadPromise;
    check(download.suggestedFilename() === "routing-receipt.json", "receipt download has expected filename");
    const stream = await download.createReadStream();
    let json = "";
    for await (const chunk of stream) json += chunk.toString();
    const exported = JSON.parse(json);
    check(exported.comparison.receipt.execution.applied === false && exported.context.state.loadedIds.length === 0, "download matches current failed selection");
    await page.getByLabel("Try a scenario").selectOption("read");
    for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no horizontal overflow at ${width}px`);
      await page.getByText("Does routing reduce the input?", { exact: true }).click();
      await page.getByText("Show the calculation", { exact: true }).click();
      await page.getByText("Inspect loaded schemas", { exact: true }).click();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `expanded details fit at ${width}px`);
      await page.getByText("Show the calculation", { exact: true }).click();
      await page.getByText("Does routing reduce the input?", { exact: true }).click();
      await page.getByText("Inspect loaded schemas", { exact: true }).click();

    }
    await page.getByText("Tools & policy", { exact: true }).click();
    check(await page.getByRole("checkbox", { name: "read_file", exact: true }).isHidden(), "closing tools preserves progressive disclosure");
    await page.getByText("Why this selection", { exact: true }).focus();
    await page.keyboard.press("Enter");
    check(await page.locator("#decision").isVisible(), "evidence disclosure works from keyboard");
    await page.keyboard.press("Enter");
    check(await page.locator("#decision").isHidden(), "evidence closes with keyboard");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(baseURL);
    await page.keyboard.press("Tab");
    check(await page.getByRole("link", { name: "Skip to task" }).evaluate(element => element === document.activeElement), "skip link is first keyboard stop");
    await page.keyboard.press("Enter");
    check(await page.getByLabel("Task message", { exact: true }).evaluate(element => element === document.activeElement), "skip link moves focus to task");
    await page.emulateMedia({ reducedMotion: "reduce" });
    check(await page.getByRole("button", { name: "Route this task" }).evaluate(element => getComputedStyle(element).transitionDuration === "1e-05s" || getComputedStyle(element).transitionDuration === "0.00001s"), "reduced motion suppresses transitions");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    check(requests.every(url => url.startsWith(baseURL)), "all browser requests remain on loopback");
    check(errors.length === 0, `no browser errors: ${errors.join("; ")}`);
    return { checks, count: checks.length, browserErrors: errors, networkRequests: requests.length, humanAccessibilityAcceptance: "not performed" };
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("request", onRequest);
  }
}
