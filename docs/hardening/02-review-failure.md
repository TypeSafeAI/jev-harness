# Failed reviews (adversarial finding 2)

A successful `JevReview` has non-null answers and `error: null`. A failed review
has null answers and an error string. The type is a discriminated union so an
adapter cannot accidentally retain answers alongside an error without a type
error. Runtime checks remain essential at serialization boundaries.

After validation, any non-null review error yields `unavailable`, even when
favorable answers survived from an earlier attempt. Validation failure still
wins and yields `reject`. No fallback to the benchmark arm is permitted.
The four questions, threshold, and legitimate successful verdicts are unchanged.

Adapters returning null answers without an error must now provide a diagnostic
string, such as `no answers returned`. Receipts retain schema version 1.
