# Noul wire contract and calibration (adversarial finding 7)

Source of truth: [TypeSafe's official Noul documentation](https://docs.typesafe.ai/primitives/noul), checked 2026-09-22.

The API supports optional `criteria` containing `true` and `false` string
explanations. Instructions can be a string, object, or array. A Noul response
contains a single probability of yes; it does not separately return confidence.
This package derives confidence from that probability. These are API contracts,
not evidence that a threshold or a particular question set is calibrated.

The pinned playground implementation contains question criteria but its local
payload validation historically stripped them. That observation does not imply
that the TypeSafe API forbids criteria.

Phase 1 extracted the payload builder (`src/contract/review.ts`) and a
criteria-preserving validator (`src/contract/payload.ts`). The frozen
`REVIEW_QUESTIONS_V1` export keeps the historical effective questions: type and
instructions, no criteria. `REVIEW_QUESTIONS_V2` preserves v2, which changed only
`addresses_task` and `evidence_supports` instructions. The current question set
v3 also sends no criteria. The playground-authored criteria text is exported as
`REVIEW_QUESTION_CRITERIA` but
not sent. No live transport is added to the package.

V2 treats an explicitly requested read or targeted inspection before a concrete
change as task-directed. An explicit request establishes the desired change
or inspection, while material factual and causal claims still need support.
The scope and clarification questions remain byte-identical to v1. The model
pin, threshold, decision table, fixtures and labels remain unchanged.

V3 changes only `addresses_task` from v2: judge progress from a single step;
a targeted read can determine how to implement a concrete change without
performing the edit itself. The other three questions remain byte-identical to v2.

Historical v1 and v2 runs retain their original meaning and question bytes. A v3
comparison must record its own questions and profile; do not relabel or pool
different question-set versions. Wire-contract tests establish serialization, not model
correctness. Live evidence for this candidate remains pending.

## Wire-contract acceptance checks

Tests must check the exact request after all validation/serialization
and immediately before the injected fake transport. Check both an instruction-
only question and a criteria-bearing question; require preservation of both
criteria descriptions, correct four IDs, pinned model, and the untrusted-data
note. Labels, mock outcomes, and evaluation expectations must remain absent.
Make malformed criteria fail validation instead of silently dropping them.
Pin the current instructions in the transport assertion, preserve the v1 and v2
question bytes, and check that v3 changes only task alignment from v2.

Compare the with-criteria and without-criteria variants on a frozen held-out
set. Freeze their distinct effective payloads and version the semantics; do not
retroactively attribute older measurements to the newly serialized questions.
Do not change the model pin or lower a threshold to make tests pass. No live
measurements are performed or claimed by this documentation correction.

## Calibration language

The model is pinned for reproducibility. `REVIEW_CONFIDENCE_THRESHOLD = 0.8`
is **uncalibrated**. A threshold sweep on the same 20 synthetic fixtures is not
an independent calibration or a production false-permit rate estimate.
