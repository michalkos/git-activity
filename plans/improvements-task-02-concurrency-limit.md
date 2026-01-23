# Task 02: Concurrency limit for git log across repos

## Goal
Speed up scans on large repo sets by limiting in-flight git commands.

## Scope
- Add a small concurrency limiter for `getCommits` calls.
- Preserve deterministic ordering of projects in output.

## Acceptance Criteria
- Concurrent fetching is capped (e.g., 4–8 in flight).
- Output ordering matches the input repo ordering.
- No change to output format besides speed.

## Files
- `src/index.ts` (or a new helper module)

## Notes
- Keep it simple (a basic promise pool is enough).
