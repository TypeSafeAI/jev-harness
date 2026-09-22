# Benchmark-only entry point (adversarial finding 6)

The normal root and contract barrel exports no longer expose `decideBase`.
Benchmark code must explicitly import it from `src/benchmark`. This source-only
package has no published exports map; deep imports into internal implementation
files remain possible and are not an authorization boundary.

The benchmark wrapper retains the original verdict but additionally records
`mode: "base"`, `source: "none"`, and `reviewed: false`. Carry these fields or
the full receipt downstream instead of stripping the result to a bare verdict.
Benchmark permit means only that validation succeeded. It must never stand in
for a failed or missing semantic review, and hosts must never implement a
provider-outage fallback to base mode.

Migration: remove the unused `decideBase` import from normal agent examples.
Move benchmark/test imports from `./src` to `./src/benchmark`. Existing benchmark
verdicts are unchanged, but the public import path deliberately changes before
publication. No new authorization or execution behavior is introduced.
