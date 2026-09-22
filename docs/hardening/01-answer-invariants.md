# Answer invariants (adversarial finding 1)

`probability` is the probability of yes and the only source of truth for an
answer triple. The decision table now requires a finite probability in [0, 1],
a finite confidence in [0.5, 1], direction exactly `p >= 0.5 ? "yes" : "no"`,
and confidence exactly `Math.max(p, 1 - p)`. JSON round-trips of canonical
answers preserve these equalities. Rounded or inconsistent adapter values
must be normalized before constructing a review, never silently trusted.

Malformed or inconsistent stored answer triples become `proposal_only` with
the question named; canonical answers retain the existing verdicts. Provider
parsing still belongs to the host: malformed raw responses become null answers
and `unavailable`. This change does not prematurely extract the upstream
transport or change any question, threshold, or authority boundary.

Regression coverage: opposite-probability favorable labels, fabricated
confidence at p=0.5, finite out-of-range values, and 625 canonical combinations.
No live model call or new calibration claim is involved.
