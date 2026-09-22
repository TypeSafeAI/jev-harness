/** Manual override lifecycle, with synthetic credentials and intercepted requests only. */
export async function verifyArenaSettings(page, baseURL, screenshotDir) {
  const checks = [], requests = [];
  const key = "typesafe-api-key-override", first = "synthetic-manual-credential", second = "synthetic-replacement-credential";
  const check = (ok, label) => { if (!ok) throw Error(label); checks.push(label); };
  await page.route("**/api/arena", route => { requests.push(route.request().headers()); return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic unavailable response; no provider called." }) }); });
  const open = () => page.locator("#key-settings").click();
  const close = () => page.getByRole("button", { name: "Close settings", exact: true }).click();
  const run = async () => { await page.getByRole("button", { name: "Run comparison" }).click(); await page.waitForFunction(() => !document.querySelector(".arena-run-actions .primary").disabled); };
  try {
    await page.goto(baseURL);
    check(await page.getByRole("button", { name: "Settings", exact: true }).isVisible(), "manual override is discoverable under Settings");
    await open();
    check(await page.getByRole("heading", { name: "Jev API key", exact: true }).isVisible() && await page.getByText("Server default", { exact: true }).isVisible(), "settings identifies the default key source");
    check(await page.getByRole("button", { name: "Save override", exact: true }).isDisabled(), "empty drafts cannot replace an existing key");
    check(await page.getByLabel("Override API key", { exact: true }).getAttribute("type") === "password", "manual entry is masked");
    await page.locator("#api-key").fill(first); await page.getByRole("button", { name: "Save override", exact: true }).click();
    check(await page.getByText("Manual override", { exact: true }).isVisible() && await page.getByText("Manual override saved.", { exact: false }).isVisible(), "saving clearly activates the manual override");
    check(await page.locator("#api-key").inputValue() === "" && requests.length === 0, "saving clears the draft and makes no provider request");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(await page.locator("#key-dialog").evaluate(e => { const rect = e.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height <= innerHeight + 1 && e.scrollWidth <= e.clientWidth; }), `settings drawer fits ${width}px`);
      if (screenshotDir && [390, 1440].includes(width)) await page.screenshot({ path: `${screenshotDir}/arena-settings-${width}.png` });
    }
    await page.keyboard.press("Escape");
    check(await page.locator("#key-settings").evaluate(e => e === document.activeElement), "Escape returns focus to Settings");
    await run();
    check(requests[0]["x-typesafe-api-key"] === first, "the comparison sends the manual override header");
    await open(); await page.getByLabel("Replacement API key", { exact: true }).fill(second); await page.getByRole("button", { name: "Replace override", exact: true }).click(); await close();
    await page.reload(); await open();
    check(await page.getByText("Manual override", { exact: true }).isVisible() && await page.locator("#api-key").inputValue() === "", "replacement persists across refresh without revealing its value");
    await close(); await run();
    check(requests[1]["x-typesafe-api-key"] === second, "the next request uses the replacement key");
    await open(); await page.getByRole("button", { name: "Remove override", exact: true }).click();
    check(await page.getByText("Server default", { exact: true }).isVisible() && await page.evaluate(key => localStorage.getItem(key) === null, key), "removing the override restores the default source");
    await close(); await run();
    check(requests[2]["x-typesafe-api-key"] === undefined, "default mode omits the override header");
    await open(); await page.locator("#api-key").fill("synthetic-unsaved-draft"); await page.keyboard.press("Escape"); await open();
    check(await page.locator("#api-key").inputValue() === "", "closing settings discards an unsaved draft");
    await page.evaluate(key => { window.originalKeyWrite = Storage.prototype.setItem; Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException("Synthetic storage failure", "QuotaExceededError"); return window.originalKeyWrite.call(this, name, value); }; }, key);
    await page.locator("#api-key").fill(first); await page.getByRole("button", { name: "Save override", exact: true }).click();
    check(await page.getByRole("alert").getByText("Could not update the override", { exact: false }).isVisible() && await page.getByText("Server default", { exact: true }).isVisible(), "storage failure does not claim an override was activated");
    await page.evaluate(() => { Storage.prototype.setItem = window.originalKeyWrite; }); await close();
    const other = await page.context().newPage(); await other.goto(baseURL);
    await other.evaluate(([key, value]) => localStorage.setItem(key, value), [key, first]);
    await page.getByRole("button", { name: "Settings, manual key override active", exact: true }).waitFor();
    check(await page.locator(".arena-welcome").isVisible(), "a key change in another tab updates Settings and invalidates stale results");
    await open(); await page.locator("#api-key").fill(second); await page.getByRole("button", { name: "Replace override", exact: true }).click(); await page.locator("#api-key").fill("synthetic-unsaved-draft");
    await other.evaluate(key => localStorage.removeItem(key), key); await other.close();
    await page.getByRole("button", { name: "Settings", exact: true }).waitFor();
    check(await page.locator("#api-key").inputValue() === "" && (await page.locator("#key-dialog .key-message[role=status]").textContent()) === "", "cross-tab key changes clear stale drafts and save confirmations");
    check(await page.locator(".key-override-dot").count() === 0, "cross-tab removal clears the active override indicator");
    return { checks, count: checks.length, providerCalls: 0, liveCliCalls: 0, humanAccessibilityAcceptance: "not performed" };
  } finally { await page.unroute("**/api/arena"); }
}
