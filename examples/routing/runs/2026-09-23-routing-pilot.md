### Routing experiment: N tools in context vs Jev top-k

> Live run, Jev `jev-1.13.0`, proposer: codex-cli (default model, isolated arena host). One run is a signal, not a calibration.

Generated 2026-09-23T05:29:15.104Z · `pnpm experiment:routing --live --runs 1 --sizes small --out examples/routing/runs/2026-09-23-routing-pilot.json` · runs: 1 · sizes: small · topK 1, confidence floor 0.7

#### Totals by arm

| Arm | Trials | Correct tool | First call correct | Routed clarify / no-match | No tool call | Unavailable | Failed | Jev calls | Jev latency median (ms) | Reported input mean | Reported output mean | Proxy input mean | Tools exposed mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A · all N schemas | 5 | 2/5 (40%) | 1 | 0 | 0 | 0 | 0 | 0 | n/a | 31949 | 202 | 521 | 3.0 |
| B · Jev top-k | 5 | 3/5 (60%) | 3 | 3 | 1 | 0 | 0 | 5 | 325.7 | 10255 | 110 | 352 | 0.4 |

#### By catalog size

| Size | N | Arm | Correct tool | Reported input mean | Proxy input mean |
| --- | --- | --- | --- | --- | --- |
| small | 3 | A · all N schemas | 2/5 (40%) | 31949 | 521 |
| small | 3 | B · Jev top-k | 3/5 (60%) | 10255 | 352 |

#### Paired per task

| Task | N | A correct | B correct | A reported input | B reported input (incl. Jev) | A proxy input | B proxy input (incl. Jev) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| read-small | 3 | 1/1 (100%) | 1/1 (100%) | 29846 | 29841 | 520 | 494 |
| patch-small | 3 | 1/1 (100%) | 0/1 (0%) | 40339 | 19962 | 526 | 549 |
| inspect-small | 3 | 0/1 (0%) | 0/1 (0%) | 29842 | 496 | 525 | 245 |
| ambiguous-small | 3 | 0/1 (0%) | 1/1 (100%) | 29816 | 487 | 514 | 234 |
| uncertain-small | 3 | 0/1 (0%) | 1/1 (100%) | 29901 | 491 | 519 | 239 |

Correct tool: a task labelled *selected* counts when the proposer completed and called an acceptable tool; a task labelled *clarify* counts when no tool was called. Reported usage is provider-returned; *unknown* is never counted as zero. Proxy input is `ceil(UTF-8 bytes / 4)` of the prompt, exposed schemas and Jev request; it is not provider usage or a saving.

- LIVE RUN: Jev jev-1.13.0 via the host choice transport; proposer is the Codex CLI arena host with its default model.
- Reported usage is what each provider returned; null means unknown, never zero. Proxy tokens are a byte heuristic and exclude the CLI's own system prompt and tool framing.
- One run is a signal, not a calibration. Correct-tool labels are synthetic and were fixed before the run.
- Jev latency is wall time around the routing call on this host; proposer duration includes CLI start-up.
