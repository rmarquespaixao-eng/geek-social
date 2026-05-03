# Constitution

These are project-level rules every phase of `dev-pipeline` MUST honor. Subagents receive this verbatim. Violation = invalid artifact (rejected by orchestrator). The Plan phase performs a Constitution Check pre- and post-design; the Review phase categorizes any violation as `rule-violation`.

Edit per repository. The default below seeds from the user's global preferences.

## Branch & merge

- Work on a dedicated feature branch — never commit to `main`.
- Merge / push only when the user explicitly asks. Do not push as a side effect.
- Do not run destructive git operations (`reset --hard`, force-push, branch delete) without explicit confirmation.

## Quality

- No tech debt — prefer the complete version of a change over a simplified MVP when both are feasible in scope.
- No backwards-compat shims for removed code: delete the old path cleanly, do not leave `// removed` markers, renamed `_unused` vars, or commented-out blocks.
- Trust internal code. Validate only at system boundaries (user input, external APIs).
- Do not add comments that explain WHAT the code does — only the WHY when non-obvious.

## API design

- Operation variants get distinct routes (e.g., `/permanent`), not query flags (`?hard=true`).
- Avoid generic boolean parameters that change behavior; prefer explicit named operations.

## Data handling

- Normalize external input at the boundary. Map foreign shapes (e.g., Steam EN response) into domain shape — do not loosen Zod / domain schema to accept raw external shape.
- Convert relative dates / locales / units once, at the boundary.

## Pipelines & batches

- When the user is observing a batch, prefer complete-per-item over fast-with-gaps. Each item must be fully processed (enrich, validate, persist) before moving to the next.
- Background work is opt-in for unattended jobs only.

## Scope discipline

- "Vou te guiando" / "stay in scope" / "nada além" = stop and revert anything started outside the explicit scope.
- Do not refactor adjacent code that is not part of the requested change, even if it looks improvable.
- Do not introduce new abstractions, helpers, or design patterns unless the requested change requires them.

## Security & safety

- Never commit `.env`, credentials, tokens, or secrets — even if explicitly staged by the user, warn first.
- Never call third-party APIs that send user data outside the project context unless authorized for this specific action.
