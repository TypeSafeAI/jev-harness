/** Offline browser checks. Intercepts live requests; consumes no credits. */
export async function verifyLiveDemo(page, baseURL = "http://127.0.0.1:4187") {
  const checks = [];
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  let calls = 0;
  let release;
  let defer = false;
  let fail = false;
  const key = "synthetic-browser-credential";
  await page.route("**/api/route", async route => {
    calls++;
    if (fail) { await route.abort("failed"); return; }
    if (defer) await new Promise(resolve => { release = resolve; });
    check(route.request().headers()["x-typesafe-api-key"] === key, "personal override sent in header only");
    check(!route.request().postData().includes(key), "key excluded from model input");
    await route.fulfill({ json: { evidence: { model: "jev-1.13.0", choice: "read_file", confidence: .9, probabilities: { read_file: .8, inspect_agent: .1, propose_patch: .05, needs_clarification: .05 } }, measurement: { requestBytes: 1200, responseBytes: 200, inputTokens: 260, outputTokens: 40, latencyMs: 120 }, error: null } });
  });
  try {
    await page.goto(baseURL);
    await page.getByRole("button", { name: "API key", exact: true }).click();
    check(await page.getByLabel("API key", { exact: true }).getAttribute("type") === "password", "key entry is masked");
    await page.getByLabel("API key", { exact: true }).fill(key);
    await page.getByRole("button", { name: "Save key", exact: true }).click();
    await page.reload();
    check(await page.getByRole("button", { name: "API key · saved" }).isVisible(), "key persists across refresh");
    await page.getByRole("button", { name: "API key · saved" }).click();
    check(await page.getByLabel("API key", { exact: true }).inputValue() === "", "saved key is never filled back into UI");
    await page.keyboard.press("Escape");
    await page.getByLabel("Evidence source").selectOption("jev");
    await page.getByLabel("Try a scenario").selectOption("patch");
    check(calls === 0, "changing live settings makes no provider call");
    await page.getByRole("button", { name: "Route with Jev" }).click();
    await page.waitForFunction(() => document.querySelector("#live-status").textContent.includes("260 input"));
    check(calls === 1, "explicit run makes one request");
    check((await page.locator("#receipt").textContent()).includes('"source": "jev"'), "receipt identifies live evidence");
    check(!(await page.locator("#receipt").textContent()).includes(key), "key excluded from receipt");
    check((await page.locator("#routed-explanation").textContent()).includes("300 for routing"), "live estimate uses actual wire request size");
    await page.getByRole("radio", { name: "Batteries included" }).check();
    check(calls === 1, "switching context mode reuses live evidence");
    defer = true;
    await page.getByRole("button", { name: "Route with Jev" }).click();
    await page.waitForFunction(() => document.querySelector("#live-status").textContent.includes("Asking Jev"));
    await page.getByRole("radio", { name: "Lean", exact: true }).check();
    while (!release) await new Promise(resolve => setTimeout(resolve, 20));
    release();
    await page.waitForFunction(() => document.querySelector("#live-status").textContent.includes("260 input"));
    check(await page.locator("#flow-loaded").textContent() === "1 schema", "pending request respects latest context mode");
    defer = false;
    fail = true;
    await page.getByRole("button", { name: "Route with Jev" }).click();
    await page.waitForFunction(() => document.querySelector("#live-status").textContent.includes("transport failed"));
    check(await page.locator("#routed-tokens").textContent() === "Unknown", "network failure leaves usage unknown");
    check(!(await page.locator("#live-status").textContent()).includes("No provider request"), "network failure is not called a skipped request");
    await page.getByRole("button", { name: "Usage · 3", exact: true }).click();
    check(await page.locator("#usage-input").textContent() === "520", "usage totals retain reported input only");
    check(await page.locator("#usage-output").textContent() === "80", "usage totals separate output tokens");
    check((await page.locator("#usage-unknown").textContent()).includes("1 requests have incomplete usage"), "usage identifies failed calls with unknown totals");
    await page.getByRole("button", { name: "Close usage dashboard" }).click();
    await page.getByRole("button", { name: "API key · saved" }).click();
    await page.getByRole("button", { name: "Remove key" }).click();
    check(await page.evaluate(() => localStorage.getItem("typesafe-api-key-override")) === null, "remove clears persisted override");
    await page.keyboard.press("Escape");
    check(await page.locator("#download").isDisabled(), "key change invalidates prior live result");
    for (const width of [320, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `live UI fits ${width}px`);
      await page.getByRole("button", { name: "API key", exact: true }).click();
      check(await page.locator("#key-dialog").evaluate(e => e.getBoundingClientRect().width <= innerWidth), `key dialog fits ${width}px`);
      await page.keyboard.press("Escape");
    }
    await page.reload();
    check(await page.getByRole("button", { name: "Usage · 3", exact: true }).isVisible(), "usage survives refresh without storing prompts or credentials");
    await page.getByRole("button", { name: "Usage · 3", exact: true }).click();
    await page.getByRole("button", { name: "Clear local usage history" }).click();
    check(await page.locator("#usage-requests").textContent() === "0", "usage history can be cleared");
    return { checks, count: checks.length, providerCalls: 0, transport: "browser interception", humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/route"); }
}
