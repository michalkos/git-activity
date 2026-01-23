# Task 01: Validate date range inputs and partial ranges

## Goal
Make `--from` / `--to` robust: validate format, handle partial ranges, and provide clear errors.

## Scope
- Validate `YYYY-MM-DD` inputs.
- Define behavior for partial ranges.
- Update README with the exact behavior.

## Acceptance Criteria
- Invalid dates print a clear error and exit non-zero.
- If only `--from` is provided, `endDate` defaults to the end of that week (or current week end).
- If only `--to` is provided, `startDate` defaults to the start of that week.
- README reflects the actual CLI behavior.

## Files
- `src/index.ts`
- `README.md`

## Notes
- Consider using `date-fns` parse/validation helpers to avoid `Invalid Date` values.
