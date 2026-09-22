# Routing room

A local, synthetic chat demonstration of tool availability, routing evidence, and schema context. Start it with:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173`. If that port is occupied, run `pnpm demo 4187` and open `http://127.0.0.1:4187`. Stop with Ctrl-C. The browser build uses the already pinned TypeScript compiler; no new dependency is installed.

## Read the flow

The default view shows one task and one result: the selected tool and the schemas loaded into context. An available tool may not be selected, and Batteries included loads available schemas even when routing asks for clarification. Loading a descriptor never executes it.

1. Choose a sample task or type a message. Samples have scripted responses; other messages ask for clarification. This is not a live chat model.
2. Open **Tools & policy** to change availability, maximum tools or the estimated cost limit. Each change recomputes the selection.
3. Switch between **Lean** and **Batteries included** to see the loaded schemas change. **Why this selection** explains the deterministic policy and shows its scripted evidence.
4. Open **Does routing reduce the input?** for a paired Without/With comparison. Both totals include the task; With routing also includes the routing request. Routing output is reported separately. **Show the calculation** reveals schema bytes and the detailed table. If no tool is selected, the panel explicitly says the runs do not represent equivalent completed work.
5. Schemas, the receipt, download and recent tasks each appear in their own disclosure. Editing inputs clears stale results and disables download until the next comparison.

The dark surfaces and rose accent follow the community [typesafe-router UI](https://github.com/TypeSafeAI/typesafe-router/blob/main/app/globals.css). This is an independent community demonstration, not the official TypeSafe AI console. The workspace fills the viewport width, with task and result side by side on desktop and stacked below 900px; advanced controls and evidence stay closed by default. Comparison cards sit side by side on larger screens and stack on narrow phones. Labels carry the same information without color.

## Data and measurement boundaries

Task text stays in browser memory. The server binds to loopback and serves an explicit asset allowlist; it has no task endpoint, provider transport or execution path. The browser has no external font, telemetry, storage or network dependency. Do not add live provider keys to this UI.

Context size is measured in serialized UTF-8 bytes. Token figures are estimates, and local comparison duration measures JS work only. The full baseline has no tool-selection model; acceptable-tool inclusion is not accuracy. The comparison leads with estimated total input including router overhead, rather than schema-only reduction. See [routing metrics](routing.md#reproduce-the-synthetic-comparison) before quoting savings.

## Verification

`pnpm test` builds the browser module graph and runs the offline contract, comparison, host-state and loopback-server integration tests. The server test follows actual compiled imports and checks the asset allowlist, HTTP methods, Host guard and CSP.

[scripts/verify-routing-browser.mjs](../scripts/verify-routing-browser.mjs) exports an optional Playwright check for an existing browser driver; Playwright is not added as a project dependency. With the demo running, import `verifyRoutingDemo` and pass a Playwright `page` and local URL. For example, from a driver that already provides a page:

```js
import { verifyRoutingDemo } from "./scripts/verify-routing-browser.mjs";
const result = await verifyRoutingDemo(page, "http://127.0.0.1:4187");
console.log(JSON.stringify(result, null, 2));
```

The [recorded browser run](verification/routing-browser-2026-09-22.json) covers selection, availability, both modes, budgets, top-k, clarification, unavailable/malformed evidence, text rendering, receipt download, stale-result invalidation, keyboard entry, reduced motion and viewport widths from 320 to 1920 pixels. There were no browser errors or external requests in that run. Screenshots were visually reviewed at desktop, tablet and phone sizes.

This is automated browser and visual inspection, not human keyboard-only or VoiceOver acceptance. Those human checks, cross-browser device testing, and live model/provider measurements remain unverified. No claim of provider speed, calibrated routing quality or total cost savings is made.
