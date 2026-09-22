# Immutable policy metadata (adversarial finding 4)

`FAVORABLE`, `REVIEW_QUESTION_IDS`, and `PROPOSAL_TOOLS` are readonly in
TypeScript and frozen at runtime. Consumers cannot change global policy by
mutating metadata or shortening the question list to make evaluation vacuous.
All values are primitive strings, so shallow freezing fully covers these
structures. Hosts changing policy must do so through a reviewed versioned
change, not mutation. This is an API invariant, not a malicious-plugin sandbox.

Verdict impact: no change for normal consumers; attempts to mutate metadata
fail. Tests cover compile-time immutability, runtime mutation attempts, and
empty-answer degradation before and after attempted mutation.
