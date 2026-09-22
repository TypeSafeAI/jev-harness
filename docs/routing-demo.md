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

## Routing room

Choose a sample, or enter a task. **Offline examples** uses scripted evidence and never calls a provider; custom offline tasks ask for clarification. **Live Jev** sends the task and compact catalog options only when you click **Route with Jev**. Changing settings does not consume credits. Switching Lean/Batteries included reuses current evidence.

The first two cards show the task and current result. **Tools & policy** reveals availability and limits. Evidence, cost calculations, schemas, receipts and history remain collapsed until opened. Desktop uses the full viewport with task/result side by side; smaller screens stack them.

**Does routing reduce the input?** leads with paired Without/With totals. With routing includes the router request. Router output is separate. No selection is explicitly not equivalent completed work. Text-size estimates use serialized UTF-8 bytes divided by four, not provider tokenization. Live reported usage is separate; missing usage stays unknown.

Input or key changes abort pending work and clear stale results. Downloads contain evidence and task data, never credentials. Neither routing mode executes a proposal.

## Key and usage controls

**API key** follows the playground's personal-override convention: masked input, save/replace/remove, origin-local `typesafe-api-key-override` storage. The saved value is never filled back into the input. Storage is unencrypted and accessible to same-origin scripts; origins include ports. A personal key overrides the host's server-only `TYPESAFE_API_KEY`. Server keys never reach the browser.

**Usage** opens reported input/output totals, a price estimate and request history for this tab's latest 200 live Jev requests. Session storage preserves scalar telemetry across refresh, without prompts or keys. Clear local history removes it. Missing usage on failed/cancelled calls is not free; partial totals are labeled. Personal and host-key calls are identified separately. CLI usage is shown per arena lane, not mixed into the Jev totals.

The input-only estimate uses the [public $42/billion input-token price](https://typesafe.ai/), checked September 22, 2026. It excludes unknown calls, output pricing, cache discounts and account-specific prices. No account balance, plan or quota is invented.

## Example lab

`/examples` offers a schema explorer and an availability/context experiment, alongside the arena. Both local experiments show exact descriptor schemas and schema-only bytes without model calls. They demonstrate composition, not routing quality or savings.

## Agent arena

`/arena` compares **Codex** with **Codex + Jev Harness** on four original synthetic tasks: reading a module, recording a proposed fix, inspecting timeouts and asking about an ambiguous request.

1. Jev routes the fixed task against the known catalog.
2. Two fresh Codex CLI processes start in parallel: the baseline MCP host exposes all fixture tools; the integrated host exposes only schemas selected by the real harness policy.
3. Each lane streams starting, working, tool-call and answer activity with an elapsed timer. Final results appear independently. Cancellation stops both processes.
4. The UI illustrates tools exposed → calls observed → agent answer in paired cards. A completed CLI with no fixture calls is labeled explicitly. A collapsible run inspector offers keyboard-navigable Usage, Tool activity, Jev’s decision and Test setup tabs. Usage bars include Jev input overhead; missing usage stays unknown. Tool events use a readable timeline, evidence uses probability bars, and raw receipts stay one level deeper.
5. The UI streams progress and shows returned answers, actual MCP calls, CLI-reported input/output/cache tokens, duration and Jev overhead. Download preserves the comparison.

Install Codex separately and run `codex login` on the host. The adapter was developed against Codex CLI 0.155.1. It uses the CLI's default model and existing file-based sign-in. Keychain-only authentication is not supported. No CLI credentials are returned to the browser.

Each lane gets a temporary working directory and an auth-only Codex home. Only `auth.json` is copied, with restrictive permissions; configuration, global instructions, memory and plugins are not copied. HOME is isolated too. The adapter disables shell, browser, computer, plugin, app and sub-agent features and selects read-only sandboxing. The host explicitly permits only the three bounded fixture tools through per-tool MCP approval settings; other tools retain the prompt default. The fixture server is required, so startup failure cannot silently turn into a tool-free run. See the [Codex MCP settings](https://developers.openai.com/codex/mcp). MCP handlers can return only the selected synthetic fixtures or record a proposal; they cannot read arbitrary files or execute proposed code. The inspector is a deterministic fixture tool, not a second model agent. Temporary directories are removed after completion.

Only fixed case ids are accepted, with no browser-supplied command, cwd, script or model. The host permits one comparison at a time. Each CLI run has time/output bounds, and cancellation terminates its process group, escalating after a short grace period. Provider failures remain visible and do not trigger a mock fallback. No model-proposed patch is applied, tested or committed.

The lanes run concurrently after routing. Shared resource contention can affect timing. Both lanes have the same task, fixture, CLI settings and default model, but independent model trajectories and cache effects. Exposed-tool selection is the treatment; this does not gate all operations in a general-purpose production agent. One run does not establish quality, accuracy, latency or cost improvements. Task quality is not scored automatically.

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

Tests use fake provider/CLI transports and a real local synthetic MCP process; they never consume provider credits. Browser verifiers accept an existing Playwright Page without adding a second test dependency. See `scripts/verify-routing-browser.mjs` and `scripts/verify-live-browser.mjs`, and `scripts/verify-arena-browser.mjs`. Run the key/usage verifier in a fresh browser context.

Recorded runs live in [verification/](verification/). Automated browser checks and screenshot inspection are not human keyboard-only or VoiceOver acceptance. Cross-browser device testing and a repeated live benchmark remain outstanding.
