# Task 03: Correct rename parsing in commit details

## Goal
Display renamed files correctly in commit detail view.

## Scope
- Parse `git diff-tree --name-status` output for `R###` entries.
- Represent rename as `old -> new` (or add `oldPath`/`newPath` fields).
- Optionally handle `C###` (copy) status.

## Acceptance Criteria
- Rename entries show both old and new paths.
- Status symbol/color is still accurate for renames.
- No regressions for A/M/D entries.

## Files
- `src/git.ts`
- `src/types.ts`
- `src/ui/CommitDetail.tsx`

## Notes
- `R100<TAB>old<TAB>new` is a common format; parse carefully.
