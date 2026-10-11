# Claude Code notes — jev-harness

Read `AGENTS.md` first; it is the project guide and applies here unchanged.

Worktree directory: create worktrees as siblings of the checkout at
`../jev-harness-wt/<name>` (`git worktree add -b <branch> ../jev-harness-wt/<name> origin/main`).
Do not use `.worktrees/` inside the repo or a global location such as
`~/.config/superpowers/worktrees/`; sandboxed agent sessions cannot reach the
latter, so worktrees parked there cannot be inspected or retired.
