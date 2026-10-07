# Arena interface

The Arena uses the graphite surfaces, IBM Plex typography, and rose controls of
[TypeSafe UI](https://ui.jev.works/). The
[component lab](https://ui.jev.works/lab) is the reference for the compact
workspace treatment. Jev Harness remains an independent community experiment.

Start the interface locally:

```sh
pnpm install --frozen-lockfile
pnpm dev
# Open http://127.0.0.1:4173
```

Choose a synthetic example, read its task, and select **Run comparison**. Use
**History** to reopen results and **Integrate** for the host integration guide.
**Settings** and **Usage** stay in the header. See the
[demo guide](routing-demo.md) for credentials, local execution requirements,
failure states, and the standalone fixture MCP command.

## Visual foundations

The reference was inspected on October 7, 2026. The implementation lives in
`app/globals.css`; it does not import a remote component registry or add a UI
package dependency.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0c1015` | Workspace and inset task surfaces |
| `--panel` | `#151a21` | Controls, results, and history |
| `--soft` | `#1e2024` | Secondary controls |
| `--line` | `#2b333e` | Structure and dividers |
| `--ink` | `#f4f4f5` | Main text |
| `--muted` | `#a2a9b5` | Supporting text |
| `--pink` | `#f386a1` | Primary actions, focus, and selection |
| `--dot` | `#19212c` | Subtle workspace grid |

IBM Plex Sans handles headings, controls, and prose. IBM Plex Mono handles
technical labels, code, and measurements. Latin font files are served from
`public/fonts/`, with their SIL Open Font License alongside them. Other scripts
use system fallbacks. Loading the page and building the app require no font
service requests.

Keep one filled primary action per surface. Use outline or ghost controls for
secondary actions. Cards use rounded corners and quiet borders; the integrated
lane gets a rose top edge without implying that its answer is better. Keep
unknown measurements and failures explicit. Color must never be the only cue.

The workspace is centered and capped at 1440px. Example cards wrap to two
columns, result lanes stack on smaller screens, and detail drawers fill the
mobile viewport. Preserve visible keyboard focus, native radio selection, tab
navigation, dialog dismissal, and reduced-motion support when editing styles.

## Product boundaries

The visual reference does not change the pinned model, question wording,
verdicts, fixture tools, or host permissions. Do not copy model selectors,
execution buttons, or success labels from a component demonstration into the
Arena unless the underlying capability exists. A favorable result is evidence,
not authorization. Hosted comparisons retain the explicit local-host error.

## Verification

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm check:secrets`.
Use `verifyArena` from `scripts/verify-arena-browser.mjs` with a fresh browser
context to check comparison, error, history, export, and responsive states with
synthetic responses. Inspect Settings and Integrate after typography changes.
Browser automation does not substitute for human accessibility acceptance.
