# Evaluation accounting and blinding (adversarial finding 9)

`src/benchmark/evaluation.ts` is an offline helper, not a live benchmark runner.
It does not import or recreate the unextracted upstream fixtures. Tests use
original synthetic arithmetic examples and make no new Jev performance claims.

## Denominators and labels

`summarizeEvaluation` separates pipeline cases, validation rejections, actual
provider attempts including retries, provider failures, unavailable pipeline
outcomes, semantic bad observations with usable answers, and distinct semantic
bad cases. A missing key can produce an unavailable case with zero calls; a
retry can produce several calls for one case. Never use pipeline cases as a
provider reliability denominator. A repeated case is not new adversarial coverage.

Labels are `acceptable`, `unacceptable`, or `clarification_required`, independent
of the scripted good/bad arm. Legitimate abstentions are counted separately from
acceptable proposals held. The latter includes provider outages and validation
rejections, so it is not itself a semantic false-positive count. Report its
causes separately. Base mode is grouped separately and never counts as semantic
review coverage. Empty inputs return zero counts and null cohort/source, not
perfect accuracy or an inferred treatment.

Rows must belong to one frozen cohort and one mock/live source. The helper
rejects duplicate (run, case, mode) observations, changed case labels or structural
validation outcomes across runs/modes, and
impossible validation/call/verdict combinations. A cohort identifier must bind
the model, exact questions including criteria, threshold, dataset and label
revisions, and evaluation code. These identifiers are evaluator assertions,
not authenticated provenance; bind them to protected manifests in a real study.
Use stable content-addressed case IDs, and do not change IDs to count a repeat
as independent coverage. This helper cannot prove that labels are correct.

## Historical evidence remains external

The source of the historical four-run results is
[playground PR 41](https://github.com/TypeSafeAI/typesafe-playground/pull/41),
head `245167db1e7e9e33ba36541c57f7f04a7b6e3c08`. That report describes seven of
20 bad proposals rejected before review and thirteen structurally valid bad
proposals reviewed. Four repeats therefore cover thirteen distinct semantic
bad cases, not 52 independent attack scenarios. The described 40-case pipeline
across four runs implies 160 pipeline cases and 132 provider calls if there is
one call per validated case and no retries; verify actual attempts from receipts
before treating this arithmetic as a measured provider denominator.

Two ambiguous good-arm expectations were changed after the first run. Preserve
that history and separate justified clarification from unnecessary blocking.
The original report and its threshold sweep are development evidence, not a
held-out calibration or a production false-permit estimate. Do not overwrite
historical artifacts with relabeled or retuned results.

## Blinded real-proposer input

Use `prepareProposerInput` and `BlindedProposer` for future real-model studies.
The helper selects only task, files, and evidence, creates detached copies, and
freezes the result. Merely annotating an input with `Pick<Fixture, ...>` does not
remove extra fields at runtime. Never pass the entire labeled Fixture, arm,
expected verdicts, mock values, or scripted proposals to a live proposer.
The existing `Proposer` interface remains for scripted-fixture compatibility.

Observation, provider-call, and evidence arrays must be dense plain data arrays.
The helpers copy own index values once without executing custom iterators or
getters; malformed arrays cannot hide attempts or substitute labeled objects
between validation and copying. This is not a sandbox for same-process proxies.

Content itself can leak labels. Independently inspect filenames, task text,
evidence, and file bodies for embedded expected outcomes; a field whitelist
cannot remove semantic leakage from the strings a model must read.

## Next experiment acceptance

Freeze policy and labels before a held-out run. Include structurally valid
misleading rationale, unsupported evidence, indirect instructions, edge-case
wrong edits, useful diagnostic reads, and appropriate abstentions. Record all
attempts, paired baselines, repeats, transport outcomes, latency distributions,
and per-category confusion counts. Use independent label review. Report both
unique-case coverage and repeat stability. Do not tune on the held-out set or
claim that the synthetic accounting tests below are new live model results.
