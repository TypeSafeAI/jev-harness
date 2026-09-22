# Security

This repository has no live provider transport and no code path that executes
a proposal. Bugs that make evidence look more trustworthy than it is still
matter. The optional audit adapter does not authenticate records merely by
hashing them; see [receipt-binding limitations](docs/hardening/05-receipt-binding.md).

## Reporting and repository provenance

Report vulnerabilities affecting this repository through
[TypeSafeAI/jev-harness private reporting](https://github.com/TypeSafeAI/jev-harness/security/advisories/new)
when enabled. Do not open a public issue containing vulnerability details,
credentials, private source, or private receipts. If the private form is not
available, request a private contact channel without including those details.
Report issues in other repositories separately to their maintainers;
this reporting channel covers this repository.

Questions about the Jev model or TypeSafe API belong with
[TypeSafe AI's official channels](https://typesafe.ai). This community project
cannot act on their behalf. Never post a key. Rotate exposed credentials first;
rewriting history does not undo disclosure.

## Checked-in safeguards

Keep all these safeguards intact; none is a reason to skip the others.

| Safeguard | Checked-in implementation |
| --- | --- |
| Local pre-commit hook | `.githooks/`, installed by pnpm's prepare step; dependency-free staged-file check and gitleaks when available |
| Ignore rules | `.gitignore` excludes environment/key files and competing lockfiles; `.env.example` uses placeholders |
| CI secret scan | Built-in tracked-file check and a pinned, checksum-checked gitleaks binary scanning full history |
| Workflow permissions | Read-only contents token, commit-pinned actions, and checkout with persisted credentials disabled |
| Dependency updates | `.github/dependabot.yml` supplies the checked-in update configuration |

A committed workflow or configuration file does not prove that it ran or that
remote settings are enabled. Maintainers must verify this repository's Actions
permissions, private reporting, secret scanning, push protection, Dependabot
alerts, and branch/ruleset enforcement independently. Required policy includes
signed commits, no unauthorized force pushes/deletion, and reviewed linear
integration; copying an upstream ruleset description does not install it here.
This documentation change does not alter any remote setting or checked-in guard.

Do not disable or bypass hooks, scanners, signing, or required CI to land a
change. For a false positive, use unambiguous placeholders such as `<your-key>`,
`$ENV_VAR`, or `op://` references and rerun the check. For a real credential,
stop and rotate it; do not merely amend it away.

## Evidence handling

Bound receipts can contain complete source snapshots and request bodies.
Apply a reviewed egress/retention/access policy before using real repositories.
Redact sensitive material before review; changing a bound record afterward
invalidates its digest. Use synthetic minimized reproductions for public bug
reports. No receipt field or digest is an execution permission.
