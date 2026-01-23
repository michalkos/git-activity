# Task 08: Improve heatmap labels and small-terminal UX

## Goal
Make UI clearer and more resilient in narrow terminals.

## Scope
- Replace “Week -1/Viewed” labels with date ranges.
- Ensure commit list truncation works well for narrow widths.
- Consider pagination or scrolling hints for long lists.

## Acceptance Criteria
- Heatmap labels show actual date ranges.
- Commit list remains readable at 80 columns.
- No layout regressions in the week view.

## Files
- `src/ui/Heatmap.tsx`
- `src/ui/CommitList.tsx`
