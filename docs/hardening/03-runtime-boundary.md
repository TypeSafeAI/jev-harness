# Runtime input boundary (adversarial finding 3)

`decide`, `decideBase`, and `unfavorable` accept `unknown` at runtime. Schema-like
TypeScript interfaces are not validation of deserialized input. A validation
success requires `ok === true` and a present empty string-array error list.
Anything else rejects, including truthy strings and contradictory errors.

A missing or malformed review envelope yields `unavailable`; malformed or
missing individual answers within a present answers object yield
`proposal_only`. This preserves the existing distinction for partial reviews.
Validation failure wins over review inspection. An invalid threshold still
throws as a deliberate configuration error; it is never clamped.

Plain records are copied through own data-property descriptors. Inherited
fields, class instances, and accessors are rejected. This boundary is for
JSON/plain data, not adversarial same-process JavaScript. Error arrays must be
dense own data entries; custom iterators and accessors are rejected without
invocation. Proxies still require process isolation and are not a supported
trust domain.

Review metadata is shape-checked, not authenticated. The host still pins the
expected model/source, verifies provenance, binds snapshots, and authorizes
any action. `permit` remains evidence only. No provider calls or I/O are added.
