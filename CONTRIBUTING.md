# Contributing

This is an independent community harness for TypeSafe AI's Jev. Useful contributions include a new synthetic fixture category, a clearer question wording (with a version bump), a reproducible surprising verdict, or a host adapter kept outside `src/contract/`.

Read [README.md](README.md) for the contract and [AGENTS.md](AGENTS.md) for boundaries. Keep changes focused; do not bundle dependency upgrades, provider transports, or new execution authority into a fixture or documentation fix.

Use the [development guide](docs/development.md) to find the owning module,
trace failures, measure performance, and prepare a reviewable PR.

## Development

```sh
pnpm install --frozen-lockfile   # also installs the pre-commit secret check (.githooks/)
pnpm verify                      # boundaries, types, offline tests, build, secret patterns
```

Tests run offline. Verification needs no TypeSafe API key, and no key should ever be in a commit; see [SECURITY.md](SECURITY.md) for the guards and what to do if one slips.

Explicit live demo comparisons require a TypeSafe API key.
CI additionally checks real sharing responses and scans full history with
gitleaks. Run the relevant browser verifiers for interface changes; report
human accessibility and live-provider acceptance separately.

## Pull requests

- One concern per PR. Say what verdicts changed and why.
- New fixtures are original synthetic content with no secrets and no operational attack steps; instruction-trap fixtures stay harmless.
- A measured claim links the run that produced it. One run is a signal, not a calibration.
- Commits are signed.
