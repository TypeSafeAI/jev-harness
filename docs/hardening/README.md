# Adversarial review hardening

These notes describe changes proposed as separate stacked PRs. Code and tests
are implemented where stated; transport extraction, real-host conformance,
and held-out live measurements are not claimed complete.

| Finding | Implementation or specification |
| --- | --- |
| 1. Contradictory/invalid answer triples | [Canonical answer invariants](01-answer-invariants.md) |
| 2. Failure with retained favorable answers | [Mutually exclusive review states](02-review-failure.md) |
| 3. Malformed runtime validation/review data | [Runtime boundary](03-runtime-boundary.md) |
| 4. Mutable exported policy | [Immutable policy metadata](04-policy-metadata.md) |
| 5. Unbound receipt evidence | [Optional receipt binding and replay](05-receipt-binding.md) |
| 6. Base permit confused with reviewed permit | [Benchmark-only entry point](06-benchmark-boundary.md) |
| 7. Incorrect Noul criteria/calibration guidance | [Wire-contract correction](07-noul-contract.md) |
| 8. Semantic review mistaken for correctness/authority | [Host-conformance specification](08-host-conformance.md) |
| 9. Benchmark denominators and label leakage | [Evaluation accounting and blinding](09-evaluation.md) |
| 10. Local/upstream provenance and stale API docs | [Repository provenance](10-repository-provenance.md) |

The model pin, four question IDs, verdict vocabulary, 0.8 default threshold,
and Receipt schemaVersion 1 remain unchanged. Pending extraction must preserve
these hardening changes instead of overwriting them with an older upstream copy.
