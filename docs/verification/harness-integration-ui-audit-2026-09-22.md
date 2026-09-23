# Arena integration workflow UI review

Reviewed the Next.js Arena on 2026-09-22 using synthetic intercepted results in fresh Chromium contexts. This review covers Compare, History, Integrate, Settings, Usage, and their empty, active, completed, failed, unknown and storage-error states. The [verification record](harness-integration-2026-09-22.json) identifies the checks and limits.

## Findings and changes

| Finding | Change | Evidence |
| --- | --- | --- |
| A simulation's lessons did not provide a concrete path into a user's existing harness. | Add an Integrate tab, a host → Jev → host flow, explicit shadow/lean brief selection, and a copyable/downloadable agent prompt tied to the actual public API. Link directly from the lessons overlay. | Prompt copy, denied-clipboard recovery, Markdown download, tab navigation, overlay closure and no-request checks. |
| Lower input or latency did not capture whether each answer met the task. | Add separate human assessments and an experiment note. Show review coverage in History and an optional paired-passing chart filter while retaining all runs. Export annotations separately from original evidence and derived lessons. | Assessment persistence, refresh, history filtering, failed-lane restrictions and export checks. |
| New disclosures and tabs could obscure an active comparison or overcrowd a small screen. | Reuse native modal drawers; hide comparison controls only in Integrate and retain a visible return-to-progress action. Stack integration cards and assessment fields on narrow screens. | Responsive checks from 320 to 1920 px for integration, existing comparison checks through 2560 px, Escape/focus and pending-run checks. Rendered integration screenshots inspected at 390 and 1440 px; assessment inspected at 390 px. |
| Reopening history mounted duplicate lesson/assessment panels because sibling keys collided. | Use distinct component keys per run. | Reopening history asserts exactly one of each panel; browser console monitoring catches duplicate-key errors. |
| Storage failure or an external update could replace an unsaved assessment draft. | Preserve drafts after failed saves, support explicit storage clearing and retry, disclose external changes before reloading, and reject stale queued writes inside the storage lock. | Quota, retry, clear/resave, clean cross-tab sync, dirty-draft conflict and queued-write race checks. |
| History’s explicit accessible row names omitted visible human assessment status. | Share the assessment label between visible text and each button’s accessible name. | Accessible names distinguish Needs work and both Meets task. |

## Presentation decisions

Preserve the existing charcoal surfaces, rose accent, compact tab underline and full-width workspace. The integration brief is the primary action in a background card; the improvement loop uses a quieter numbered list. Long prompts, measurement details and assessment fields appear only after an explicit action. Human annotations, provider evidence and host authority use distinct language throughout.

The prompt asks the coding agent to inspect the actual host, pin the source, preserve native schema validation and grants, instrument routing overhead and quality, evaluate repeated matching tasks, and retain an explicit rollback. It does not interpolate stored notes, answers or credentials. The reusable `prepareToolContext` helper and runnable synthetic host example make these instructions concrete.

## Remaining evidence limits

Automated Chromium interactions and visual screenshot inspection are not human keyboard-only or VoiceOver acceptance. Physical-device and cross-browser acceptance, real host integration, a repeated live performance study and production rollout remain outside these checks. Tests make no live provider or coding-CLI calls. No performance improvement is claimed from synthetic test measurements.
