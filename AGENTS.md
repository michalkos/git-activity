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

# Agent activity (local AI tools)
bun run src/index.ts agents --list
bun run src/index.ts agents --agents claude --json

# Combined git + agent activity
bun run src/index.ts all
bun run src/index.ts all --json
```

## Architecture

### Data Flow
1. **Entry point** (`index.ts`): Parses CLI args with Commander, orchestrates scanning/reporting
2. **Repository discovery** (`scanner.ts`): Recursive directory scanning for `.git` folders
3. **Commit extraction** (`git.ts`): Runs `git log` via Bun's `$` shell, parses custom format
4. **Time estimation** (`time-estimator.ts`): Groups commits into work sessions (2hr gap threshold)
5. **Rendering** (`ui/`): Ink components display results in terminal

`git-activity all` is a third pipeline layered on the other two: build the git report and the agent report for the same range → attribute each agent cwd to the deepest git repo containing it (`combined/match.ts`) → merge both sides' time intervals per project/day so shared time is counted once → TUI / export. `combined/report.ts` also produces the day timeline (commits and sessions interleaved). The git report builders moved to `src/report.ts` so both `index.ts` and `combined/cli.ts` use them.

Agent activity (`git-activity agents`) is a sibling pipeline: detect local tools → filter by `~/.git-activity/agents.json` → each adapter lists sessions → group by project cwd → merge overlapping intervals → TUI / export. All six sources parse sessions: Claude Code, Pi, Codex, GitHub Copilot CLI, VS Code Copilot Chat, and Cursor. Each adapter lives in its own file under `src/agents/sources/` with a fixture test, streams JSONL rather than loading transcripts, and reports a broken file as a warning so one bad source never fails the report. Shared parsing helpers live in `sources/common.ts`.

### UI Components (Ink/React)
- `App.tsx`: Root component, handles view state switching and keyboard input
- `WeekView.tsx`: Main weekly summary table
- `CommitList.tsx`: Detail view for commits on a specific day
- `Heatmap.tsx`: GitHub-style activity visualization
- `useNavigation.ts`: Keyboard navigation state management hook
- `CombinedApp.tsx` / `CombinedWeekView.tsx` / `TimelineView.tsx`: the `all` command's week and day views. The timeline reuses `CommitDetail` and `SessionDetail` for level three, picking one by row kind; its column maths live in `timelineRows.ts`.
- `SessionList.tsx` / `SessionDetail.tsx`: Agent day and session views; their layout maths (source grouping, column widths, scroll windows) live in `sessionRows.ts` so the components stay declarative. Columns are ASCII and sized against `terminalWidth - 4` — ambiguous-width glyphs break the alignment.

### Key Types (`types.ts`)
- `WeeklyReport`: Top-level report containing `ProjectActivity[]`
- `ProjectActivity`: Per-repo data with `Map<string, DayActivity>` (keyed by YYYY-MM-DD)
- `WorkSession`: Time span of related commits (used for hour estimation)
- `ViewState`: Union type for navigation (`'week'` | `'commits'`)

### Combined Types (`combined/types.ts`)
- `CombinedDayActivity`: one project-day holding both `commits` and `sessions`, with `gitHours` / `agentHours` (each side alone) and `estimatedHours` (merged)
- `TimelineEntry`: a discriminated union of a commit or a session, ordered by time
- `CombinedViewState`: `'week'` | `'timeline'` | `'commit-detail'` | `'session-detail'`

### Configuration
- Reads `.env` for `GIT_ACTIVITY_AUTHORS` (required) and `GIT_SCAN_DEPTH`
- Cache stored at `~/.git-activity/repos.json`
- Agent selection stored at `~/.git-activity/agents.json`

### Time Estimation Logic
- Commits within 2 hours are grouped into sessions
- 15-minute buffer added before first and after last commit
- Minimum 30-minute session time
