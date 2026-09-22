# Jev Harness demo

A local Next.js App Router application with a dark, full-width React interface. The pure harness in `src/` is shared by the UI and host; it has no provider client or executor.

```sh
pnpm install --frozen-lockfile
pnpm dev
# http://127.0.0.1:4173

pnpm build
pnpm start
# Alternate port: pnpm exec next start --hostname 127.0.0.1 --port 4198
```

The pinned webpack build uses extension aliases so the package's ESM `.js` imports continue resolving to TypeScript without changing the library contract. No remote fonts, analytics or UI asset services are used.

## One arena

The root page is the Agent arena. `/arena` redirects to `/`; the previous Routing room and `/examples` pages are removed. The pure routing experiments remain available through `pnpm bench:routing`.

Choose an example from four labeled radio cards. Each explains the task's purpose and shows its local run count. Keyboard arrows change the selection; the task preview updates without a request. **Run comparison** starts the agents. Examples are disabled while running, and each lane reports progress independently. Compare and History are views of the same workspace.

Primary details open in a modal drawer over the content: **How the comparison works**, **Explore this run**, **Tool activity**, and **Read full answer**. Opening them preserves the underlying layout. Escape, Close, or the desktop backdrop dismisses the drawer and restores focus. Small screens use the full viewport. Raw receipts and recorded proposals remain one level deeper inside the inspector.

## Key and usage controls

**API key** follows the playground's personal-override convention: masked input, save/replace/remove, origin-local `typesafe-api-key-override` storage. The saved value is never filled back into the input. Storage is unencrypted and accessible to same-origin scripts; origins include ports. A personal key overrides the host's server-only `TYPESAFE_API_KEY`. Server keys never reach the browser.

**Usage** opens reported input/output totals, a price estimate and request history for this tab's latest 200 live Jev requests. Session storage preserves scalar telemetry across refresh, without prompts or keys. **Clear local usage history** removes only that telemetry. Missing usage on failed/cancelled calls is not free; partial totals are labeled. Personal and host-key calls are identified separately. CLI usage is shown per arena lane, not mixed into the Jev totals.

The input-only estimate uses the [public $42/billion input-token price](https://typesafe.ai/), checked September 22, 2026. It excludes unknown calls, output pricing, cache discounts and account-specific prices. No account balance, plan or quota is invented.

## Agent comparison

The arena compares **Codex** with **Codex + Jev Harness** on four original synthetic tasks: reading a module, recording a proposed fix, inspecting timeouts and asking about an ambiguous request.

1. Jev routes the fixed task against the known catalog.
2. Two fresh Codex CLI processes start in parallel: the baseline MCP host exposes all fixture tools; the integrated host exposes only schemas selected by the real harness policy.
3. Each lane streams starting, working, tool-call and answer activity with an elapsed timer. Final results appear independently. Cancellation stops both processes.
4. Paired cards lead with available-tool counts, reported input tokens and duration, followed by readable agent answers. The integrated totals include Jev input and routing time, with their CLI/Jev components visible. These durations add measured work per lane; they are not the concurrent comparison’s wall-clock time. The headline shows both the input difference and the timing tradeoff when both runs complete and the measurements are known. Long answers have an explicit preview and a full-answer drawer. Tool names and call statuses live in a modal **Tool activity** drawer. Desktop cards share aligned rows; mobile cards stack with compact metrics. A completed CLI with no fixture calls is labeled explicitly. An overlay run inspector offers keyboard-navigable Usage, Tool activity, Jev’s decision and Test setup tabs. Usage bars include Jev input overhead; missing usage stays unknown. Tool events use a readable timeline, evidence uses probability bars, and raw receipts stay one level deeper.
5. The UI streams progress and shows returned answers, actual MCP calls, CLI-reported input/output/cache tokens, duration and Jev overhead. Download preserves the comparison.

The CLI arena host supports macOS and Linux; Windows is explicitly refused before creating a workspace or starting a process because process-tree cleanup is not implemented there. The browser UI itself remains responsive across device sizes.

Install Codex separately and run `codex login` on the host. The adapter was developed against Codex CLI 0.155.1. It uses the CLI's default model and existing file-based sign-in. Keychain-only authentication is not supported. No CLI credentials are returned to the browser.

Each lane gets a temporary working directory and an auth-only Codex home. Only `auth.json` is copied, with restrictive permissions; configuration, global instructions, memory and plugins are not copied. HOME is isolated too. The adapter disables shell, browser, computer, plugin, app and sub-agent features and selects read-only sandboxing. The host explicitly permits only the three bounded fixture tools through per-tool MCP approval settings; other tools retain the prompt default. The fixture server is required, so startup failure cannot silently turn into a tool-free run. See the [Codex MCP settings](https://developers.openai.com/codex/mcp). Fixture contents are not included in the agent prompt: only the task and available paths are shared. Source-dependent tasks must use read/inspection tools or explain the missing capability. MCP handlers can return only the selected synthetic fixtures or record a proposal; they cannot read arbitrary files or execute proposed code. The inspector is a deterministic fixture tool, not a second model agent. Temporary directories are removed after completion.

Only fixed case ids are accepted, with no browser-supplied command, cwd, script or model. The host permits one comparison at a time. Each CLI run has time/output bounds, and cancellation terminates its process group, escalating after a short grace period. Provider failures remain visible and do not trigger a mock fallback. Recorded proposals retain their path, diff and rationale in the tool trace and download, with `applied: false`. The MCP host limits handler execution to the first 100 calls and retained proposal content to 256 KB per lane; later/excess proposals are rejected rather than claimed as recorded. No model-proposed patch is applied, tested or committed.

The lanes run concurrently after routing. Shared resource contention can affect timing. Both lanes have the same task, fixture, CLI settings and default model, but independent model trajectories and cache effects. Exposed-tool selection is the treatment; this does not gate all operations in a general-purpose production agent. One run does not establish quality, accuracy, latency or cost improvements. Task quality is not scored automatically.

## Local results and trends

Each settled request creates a versioned snapshot of the task and synthetic files, routing receipt, full returned answers, proposals, tool events, reported usage, original start/end timestamps and completion status. Complete, partial, cancelled and failed runs remain inspectable. A reload restores the latest known example without making a provider request. Reopening or downloading a saved result also makes no request.

History uses origin-local `jev-arena-history-v1` storage, separate from the API key and tab usage log. It retains the newest 30 runs within 2 MB of serialized UTF-8, evicting oldest runs first. Oversized individual results are not silently truncated. Storage errors are visible; the current snapshot stays available in memory for download, while previous readable history is preserved. Corrupt or unsupported history must be explicitly cleared before new saves. Cross-tab changes update the UI without cancelling an active comparison; Web Locks serialize mutations where supported. Without Web Locks, overlapping cross-tab writes can lose the last competing write.

Input and duration trends pair completed lanes only when the fixture id, task, files and harness setup revision match. Input includes CLI plus Jev reported input; duration includes CLI plus routing time. Missing values, partial runs and older setups stay in the list but are excluded from chart medians. Exact values and dates are available in each keyboard-accessible row. Chart spacing follows run order, not elapsed wall time. One sample is labeled a starting point. CLI defaults, model trajectories and cache effects may vary; history is observation, not a quality or cost benchmark. Bump `ARENA_SETUP_VERSION` when prompts, catalogs or host settings change comparability.

History is unencrypted local evidence, not authenticated provenance or an account-wide database. It contains no API-key fields. Clear local history requires confirmation and leaves the API key and usage log intact; clearing usage leaves comparisons intact. Saved results from another port or device are not synchronized.

## Local host boundary

The Next.js API requires loopback Host/Origin for live operations, bounded JSON bodies and explicit POST requests. `/api/route` rebuilds its payload from the fixed catalog, pins `jev-1.13.0`, validates the full distribution and strips provider error bodies. It limits live starts to 30/minute and two concurrent requests per process across tabs and keys. These are local safeguards, not authentication or account-wide quotas. Do not forward this local app publicly.

Only supplied task text and fixed tool descriptions reach TypeSafe. The arena sends its synthetic task and files to Codex. Do not use private repository content, personal memory or credentials as tasks. Nothing in the exported pure package has execution authority.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check:secrets
```

Tests use fake provider/CLI transports and a real local synthetic MCP process; they never consume provider credits. Browser verifiers accept an existing Playwright Page without adding a second test dependency. See `scripts/verify-arena-browser.mjs`, `scripts/verify-arena-history-browser.mjs` and `scripts/verify-arena-controls-browser.mjs`. Run each verifier in a fresh browser context.

The [arena history verification](verification/arena-history-2026-09-22.json) records offline unit, browser and build checks for the sole arena, example selection, overlays, persistence, unknown/partial outcomes and responsive layouts. Recorded runs live in [verification/](verification/). Automated browser checks and screenshot inspection are not human keyboard-only or VoiceOver acceptance. Cross-browser device testing and a repeated live benchmark remain outstanding.
