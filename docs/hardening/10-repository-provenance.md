# Local repository provenance (adversarial finding 10)

This is `TypeSafeAI/jev-harness`, an independent community repository,
not TypeSafe AI's official SDK or product team. The hardening series was
ported from `CompleteDotTech/jev-harness`; repository links target this destination.
The README clone command and CI badge, issue contact links, and private security
reporting destination now identify this repository. Upstream historical measurements
remain explicitly attributed to the playground, not newly measured here.

Documentation distinguishes checked-in security safeguards from remote settings
that must be verified separately. No Actions, scanner, signing, dependency, or
remote permission setting is disabled or weakened. An upstream synchronization
merged into the hardening branch during preparation; its checked-in security
and dependency changes are preserved.

README and architecture examples now match the actual public exports, hardened
decision inputs, optional receipt adapter, and benchmark/evaluation entry points.
They do not claim that the still-unextracted runner, transport, or validator is
implemented. The root no longer suggests importing the benchmark-only helper.
The hardening index makes all ten findings and their implementation limits visible.

Before merging the stack, verify signed commits and passing checks for each
current head. A badge is not a substitute for exact-head CI evidence. If changes
are squash-merged, rebase and retarget dependent PRs in order rather than assuming
GitHub will preserve the intended one-finding diff automatically.
