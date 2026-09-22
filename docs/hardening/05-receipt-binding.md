# Bound receipt evidence (adversarial finding 5)

The optional Node entry point `src/audit/receipt.ts` wraps, but does not change,
`Receipt` schema v1. `createBoundReceipt` binds the full receipt to a policy
version, immutable decision-code revision, threshold, question-set version,
requested model, source, task, exact file contents, and exact serialized
request body. Record the body **after** host serialization/validation, not a
pre-validation approximation. A dirty workspace changes the binding even
when Git HEAD does not move. Provider failures and no-review receipts remain
distinct, and existing evidence is never converted to authorization.

The adapter hashes bounded canonical JSON with SHA-256, rejects lossy JSON,
checks request task/files/proposal and model/source consistency, and recomputes
the stored decision and execution status. `replayBoundReceipt(record, expected)`
returns an explicit audit result, not a new review verdict. `expected` must
come from independently trusted host policy/current state, never from the
untrusted record being checked. Different question text/criteria is detectable
because the exact request body is bound, even if a version bump was forgotten.

The SHA-256 digest is **not a signature**. A writer controlling a receipt can
rewrite answers and rehash it. This detects accidental corruption and binding
mismatches, not a malicious authorized log writer. Hosts requiring authentic
provenance must authenticate or externally anchor the record and verify the
transport/source separately. A host-supplied revision string is not proof that
those exact bytes ran; deployment provenance must establish that fact.

No filesystem, network, clock, key management, approval, or execution is
introduced. The pure root/contract exports do not import this Node adapter.
This does not supply a production log store, fsync, or a whole agent runner.
The host constructs a receipt, handles storage failures, and owns authorization.

Records contain source content. Use only synthetic inputs until the host has
reviewed egress, retention, access, encryption, and redaction policies. Redact
before producing a review; modifying bound records afterward invalidates them.
Do not publish full receipts from private repositories or credentials.

Tests cover 0.6/0.8 threshold ambiguity, dirty snapshots, source/model/request
substitution, post-construction mutation, digest/metadata corruption, stored
verdict/status inconsistency, and deterministic bounded serialization.

Runtime enum fields must be exact strings; arrays that stringify to a mode,
arm, source, or tool are rejected. Any rejected validation, including a true
flag paired with errors, must have no retained review or request provenance.
The canonical JSON size budget includes escaped string values, object keys,
and punctuation, and is enforced while encoding rather than after joining an
unbounded result. Valid v1 receipt verdicts are unchanged.

Creation enforces the size and structural budgets on the complete envelope,
including integrity metadata, so a returned receipt fits the replay limits.
