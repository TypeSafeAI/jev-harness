# Noul wire contract and calibration (adversarial finding 7)

Source of truth: [TypeSafe's official Noul documentation](https://docs.typesafe.ai/primitives/noul), checked 2026-09-22.

The API supports optional `criteria` containing `true` and `false` string
explanations. Instructions can be a string, object, or array. A Noul response
contains a single probability of yes; it does not separately return confidence.
This package derives confidence from that probability. These are API contracts,
not evidence that a threshold or a particular question set is calibrated.

The pinned playground implementation contains question criteria but its local
payload validation historically stripped them. That observation does not imply
that the TypeSafe API forbids criteria. This repository does not yet contain the
payload builder, so this PR corrects guidance without claiming to fix a live
transport or silently changing question-set v1's historical effective payload.

## Extraction acceptance checks

The extraction PR must test the exact request after all validation/serialization
and immediately before the injected fake transport. Check both an instruction-
only question and a criteria-bearing question; require preservation of both
criteria descriptions, correct four IDs, pinned model, and the untrusted-data
note. Labels, mock outcomes, and evaluation expectations must remain absent.
Make malformed criteria fail validation instead of silently dropping them.

Compare the with-criteria and without-criteria variants on a frozen held-out
set. Freeze their distinct effective payloads and version the semantics; do not
retroactively attribute older measurements to the newly serialized questions.
Do not change the model pin or lower a threshold to make tests pass. No live
measurements are performed or claimed by this documentation correction.

## Calibration language

The model is pinned for reproducibility. `REVIEW_CONFIDENCE_THRESHOLD = 0.8`
is **uncalibrated**. A threshold sweep on the same 20 synthetic fixtures is not
an independent calibration or a production false-permit rate estimate.
