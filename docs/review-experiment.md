# Repeated proposal-review experiment

Run the current frozen fixture suite with recorded attempt accounting:

```sh
pnpm experiment:review --runs 1 --out /tmp/review-mock.json
```

The default is offline and needs no key. `--runs` accepts 1 through 4: each
repetition evaluates both arms of every fixture in base and plus-Jev modes.
With the current 25 pairs, that produces 50–200 plus-Jev pipeline cases and
the same number of base cases. Structural rejections do not call the reviewer.
Repeated fixtures measure repeatability, not new adversarial coverage.

For an explicitly authorized manual measurement, supply `TYPESAFE_API_KEY`
from the host secret store and add `--live`. Live mode refuses to run in CI.

```sh
pnpm experiment:review --live --runs 1 --out /tmp/review-live.json
pnpm exec tsx scripts/analyze-review-runs.ts /tmp/review-live.json --json
```

Requests run sequentially without retries. The output path must be absent:
the CLI reserves it before sending requests and never overwrites prior evidence.
Interrupting the CLI cancels its request and writes the completed and interrupted
cases with partial status. Cases not started remain explicitly counted.
Settled receipts retain their answered or unavailable attempt status if a later
interrupt stops the batch. A request cancelled before its review settles retains
an unavailable receipt and a cancelled attempt.

The artifact includes source revision and file hashes, exact questions and
profile hash, frozen fixture/label metadata, receipts, indexed repetitions,
attempts, response status, host latency, and independently nullable input/output
usage. The analyzer treats each indexed repetition as a separate run. Compare
candidate profiles separately; pooling different questions is not repeatability.

Only synthetic task, files, evidence and proposal fields reach Jev. Labels and
mock values stay in evaluation metadata. The host retains sanitized response
fields and generic failure classifications, never keys or provider error bodies.
Digests establish reproducibility, not authenticated provenance.

The ordinary pipeline produces every verdict. The model remains `jev-1.13.0`
and the default threshold remains 0.8, uncalibrated. Base mode is a benchmark
control, never a fallback for review failure. Nothing proposed is applied or
executed. A perfect observed score would establish only this synthetic suite's
observed result, not production correctness or calibration.
