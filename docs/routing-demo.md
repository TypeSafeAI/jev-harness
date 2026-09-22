# Routing room

A local, synthetic chat demonstration of tool availability, routing evidence, and schema context. Start it with:

```sh
pnpm install --frozen-lockfile
pnpm demo
```

Open `http://127.0.0.1:4173`. If that port is occupied, run `pnpm demo 4187` and open `http://127.0.0.1:4187`. Stop with Ctrl-C. The browser build uses the already pinned TypeScript compiler; no new dependency is installed.

## Read the flow

The three summary cards show host availability, routing selection and loaded schema context. They are separate: an available tool may not be selected, and Batteries included loads available schemas even when routing asks for clarification. Loading a descriptor never executes it.

1. Choose a sample task or type a message. Samples have scripted responses; other messages ask for clarification. This is not a live chat model.
2. Toggle available tools or change maximum tools and the estimated cost limit. Each change recomputes the selection. Probability bars show the synthetic evidence; selection is deterministic policy, not hidden model reasoning.
3. Switch between Lean and Batteries included. The loaded schema chips, load/eviction transition and summary update together.
4. Expand the cost breakdown, schemas or receipt for the complete record. Download saves the current paired comparison as JSON. Editing inputs clears stale results and disables that download until the next comparison.

The dark surfaces, rose controls and teal evidence accents follow the community [typesafe-router UI](https://github.com/TypeSafeAI/typesafe-router/blob/main/app/globals.css). This is an independent community demonstration, not the official TypeSafe AI console. Background cards distinguish the three stages; text labels and values carry the same information without color. The layout changes from three columns to a two-column tablet layout and a single phone column. A mobile shortcut brings the current context into view.

## Data and measurement boundaries

Task text stays in browser memory. The server binds to loopback and serves an explicit asset allowlist; it has no task endpoint, provider transport or execution path. The browser has no external font, telemetry, storage or network dependency. Do not add live provider keys to this UI.

Context size is measured in serialized UTF-8 bytes. Token figures are estimates, and local comparison duration measures JS work only. The full baseline has no tool-selection model; acceptable-tool inclusion is not accuracy. Router overhead appears in the expanded comparison. See [routing metrics](routing.md#reproduce-the-synthetic-comparison) before quoting savings.

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
