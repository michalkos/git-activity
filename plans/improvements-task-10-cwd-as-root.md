# Task 10: Use current directory as scan root when running `git-activity`

## Status: Done

## Goal
Allow calling `git-activity` from any directory and treat the current directory as the scan root, ignoring env defaults.

## Scope
- Add a CLI option (or default behavior) to set scan path to `process.cwd()`.
- When this mode is active, ignore `GIT_SCAN_PATH` and any default `~/Developer/projects` fallback.
- Update README with the new behavior and examples.

## Acceptance Criteria
- Running `git-activity` inside a directory scans that directory as the root.
- `--path` still overrides everything when explicitly provided.
- Clear messaging in CLI help/README.

## Files
- `src/index.ts`
- `README.md`

## Notes
- Decide whether this is default behavior or behind a flag (e.g., `--cwd`).
