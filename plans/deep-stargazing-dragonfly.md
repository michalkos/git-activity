# Plan: Add Commit Detail Navigation to CommitList

## Summary
Add the ability to navigate through commits in CommitList and drill down to see full commit message and files changed.

## Files to Modify

### 1. `src/types.ts` - Add new types
- Add `FileChange` interface with `path` and `status` (A/M/D/R)
- Add `CommitDetails` interface with hash, subject, body, author, email, date, and files array
- Extend `ViewState` union with new `'commit-detail'` variant containing `projectPath`, `date`, `commitHash`

### 2. `src/git.ts` - Add getCommitDetails function
```typescript
export async function getCommitDetails(repoPath: string, commitHash: string): Promise<CommitDetails | null>
```
- Use `git log -1 --format=%s|%b|%an|%ae|%aI` for full message
- Use `git diff-tree --no-commit-id --name-status -r` for file changes
- Return null on error

### 3. `src/ui/useNavigation.ts` - Extend navigation
- Add `selectCommit(projectPath, date, commitHash)` action
- Update `goBack()` to handle 3-level navigation:
  - From `commit-detail` → back to `commits` view (preserve projectPath/date)
  - From `commits` → back to `week` view (restore previousIndex)

### 4. `src/ui/CommitList.tsx` - Add keyboard navigation
- Add local `selectedIndex` state with `useState`
- Import `useInput` from ink for keyboard handling
- Handle up/down arrows to move selection
- Handle Enter to call `onSelectCommit` callback
- Add `onSelectCommit: (commitHash: string) => void` prop
- Highlight selected commit with background color
- Update header hint: `[↑↓] Navigate [Enter] Details [Esc] Back`

### 5. `src/ui/CommitDetail.tsx` - Create new component (NEW FILE)
- Props: `repo`, `commitHash`, `terminalWidth`
- Fetch details on mount with `useEffect` + loading state
- Display: commit hash, author, date, full subject, body, files list
- Show file status indicators: + (green), - (red), ~ (yellow)
- Header with `[Esc] Back` hint

### 6. `src/ui/App.tsx` - Wire up new view
- Import `CommitDetail` component
- Add keyboard handling for `commit-detail` view (Esc → goBack)
- Add render branch for `commit-detail` view before `commits` view
- Pass `onSelectCommit` callback to `CommitList` that calls `navActions.selectCommit`

## Implementation Order
1. types.ts (no dependencies)
2. git.ts (depends on types)
3. useNavigation.ts (depends on types)
4. CommitDetail.tsx (depends on types, git.ts)
5. CommitList.tsx (add navigation)
6. App.tsx (wire everything together)

## Verification
1. Run `bun run src/index.ts`
2. Navigate to a day with commits (Enter)
3. Use up/down arrows to select a commit
4. Press Enter to view commit details
5. Verify full message and file list display
6. Press Esc to go back to commit list
7. Press Esc again to return to week view
