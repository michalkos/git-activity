# Task 04: CSV export escaping for all fields

## Goal
Ensure CSV output is valid when fields include commas, quotes, or newlines.

## Scope
- Quote any field containing comma, quote, or newline.
- Escape quotes by doubling them (`"` → `""`).
- Apply to project name, path, and any other textual fields.

## Acceptance Criteria
- CSV passes basic import in spreadsheets with special characters.
- No change to numeric fields.

## Files
- `src/export.ts`

## Notes
- Consider a small helper `csvEscape(value: string)`.
