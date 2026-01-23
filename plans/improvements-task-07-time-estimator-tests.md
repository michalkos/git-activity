# Task 07: Add unit tests for time estimation and date grouping

## Goal
Cover core time estimation logic with tests.

## Scope
- Add tests for:
  - Single commit session
  - Gap just under/over 2 hours
  - Buffer and minimum session duration
  - Day grouping across midnight
- Add a test runner (Bun test recommended).

## Acceptance Criteria
- Tests pass via `bun test` (or configured runner).
- Key edge cases covered and readable.

## Files
- `src/time-estimator.ts`
- `tests/` (new)
- `package.json` (test script)
