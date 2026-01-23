# Task 06: Provide author CLI override and fallback

## Goal
Make author selection more flexible and avoid hard failures.

## Scope
- Add `--author` CLI option (repeatable or comma-separated).
- Use `--author` over `GIT_ACTIVITY_AUTHORS` if provided.
- Optionally fallback to `git config user.name/email` with a warning.

## Acceptance Criteria
- `--author` works without `.env`.
- If no authors are found, error message suggests `--author` usage.
- README documents the new option and behavior.

## Files
- `src/index.ts`
- `src/git.ts`
- `README.md`
