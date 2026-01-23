# AGENTS.md

This file provides guidance to AI Agent when working with code in this repository.

## Project Overview

Git Activity Tracker is a Bun-based CLI tool that scans directories for git repositories and generates weekly activity reports. It features an interactive TUI built with Ink (React for CLI), GitHub-style heatmaps, and export capabilities.

## Commands

```bash
# Install dependencies
bun install

# Run the CLI
bun run src/index.ts

# Development mode (auto-reload)
bun --watch run src/index.ts

# Common CLI flags
bun run src/index.ts -w 1          # Last week
bun run src/index.ts --from 2026-01-01 --to 2026-01-15  # Date range
bun run src/index.ts --export csv  # Export to CSV
bun run src/index.ts --json        # JSON output
bun run src/index.ts --refresh     # Ignore cache, rescan repos
```

## Architecture

### Data Flow
1. **Entry point** (`index.ts`): Parses CLI args with Commander, orchestrates scanning/reporting
2. **Repository discovery** (`scanner.ts`): Recursive directory scanning for `.git` folders
3. **Commit extraction** (`git.ts`): Runs `git log` via Bun's `$` shell, parses custom format
4. **Time estimation** (`time-estimator.ts`): Groups commits into work sessions (2hr gap threshold)
5. **Rendering** (`ui/`): Ink components display results in terminal

### UI Components (Ink/React)
- `App.tsx`: Root component, handles view state switching and keyboard input
- `WeekView.tsx`: Main weekly summary table
- `CommitList.tsx`: Detail view for commits on a specific day
- `Heatmap.tsx`: GitHub-style activity visualization
- `useNavigation.ts`: Keyboard navigation state management hook

### Key Types (`types.ts`)
- `WeeklyReport`: Top-level report containing `ProjectActivity[]`
- `ProjectActivity`: Per-repo data with `Map<string, DayActivity>` (keyed by YYYY-MM-DD)
- `WorkSession`: Time span of related commits (used for hour estimation)
- `ViewState`: Union type for navigation (`'week'` | `'commits'`)

### Configuration
- Reads `.env` for `GIT_ACTIVITY_AUTHORS` (required) and `GIT_SCAN_DEPTH`
- Cache stored at `~/.git-activity/cache.json`

### Time Estimation Logic
- Commits within 2 hours are grouped into sessions
- 15-minute buffer added before first and after last commit
- Minimum 30-minute session time
