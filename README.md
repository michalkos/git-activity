# Git Activity Tracker

A Bun-based CLI tool that scans directories for git repositories and generates weekly activity reports for your commits.

## Features

- Recursive git repository discovery with configurable depth
- Work time estimation based on commit timestamps
- Interactive TUI with keyboard navigation
- Combined git + AI-agent week, with overlapping time counted once
- GitHub-style activity heatmap
- Export to CSV and Markdown formats
- Repository caching for faster subsequent runs

## Preview

```
╭─────────────────────────────────────────────────────────────────────────────
│ Week: Feb 16 - Feb 22, 2026                                  (Current Week)
│ ────────────────────────────────────────────────────────────────────────────
│ Monday, Feb 16
│ └── git-activity (~/Developer/projects/git-activity)           ~2h  3 commits
│
│ Wednesday, Feb 18
│ ├── api-service (~/Developer/projects/api-service)           ~1.5h  2 commits
│ └── frontend-app (~/Developer/projects/frontend-app)         ~0.5h  1 commit
│
│ Thursday, Feb 19
│ └── git-activity (~/Developer/projects/git-activity)           ~3h  5 commits
│ ────────────────────────────────────────────────────────────────────────────
│ Weekly Total: ~7h across 3 projects
│
│          Mo Tu We Th Fr Sa Su
│ Week -2  ·· ·· ░░ ·· ·· ·· ··
│ Week -1  ░░ ·· ·· ▓▓ ·· ·· ··
│ Viewed   ░░ ·· ▓▓ ▓▓ ·· ·· ··
│
│           └─ Intensity: · none  ░░ low  ▓▓ medium  ██ high
│
│ [↑↓] Navigate  [←→] Week  [Enter] Details  [q] Quit
╰─────────────────────────────────────────────────────────────────────────────
```

> The currently selected row is highlighted in blue. Use `↑`/`↓` to navigate rows and `Enter` to drill into commits for that day.

## Installation

```bash
# Clone and install
cd git-activity
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env to add your git author names/emails
```

## Configuration

Create a `.env` file with your author identifiers:

```env
# Comma-separated list of author identifiers
GIT_ACTIVITY_AUTHORS=Your Name,your.email@example.com,alternate@email.com

# Max scan depth (optional)
GIT_SCAN_DEPTH=3
```

If you prefer to save the value as a shell environment variable instead of a `.env` file:

```bash
# Current shell session only
export GIT_ACTIVITY_AUTHORS="Your Name,your.email@example.com,alternate@email.com"

# Persist for future shells (zsh)
echo 'export GIT_ACTIVITY_AUTHORS="Your Name,your.email@example.com,alternate@email.com"' >> ~/.zshrc
source ~/.zshrc
```

Windows (PowerShell):

```powershell
# Current session only
$env:GIT_ACTIVITY_AUTHORS = "Your Name,your.email@example.com,alternate@email.com"

# Persist for future shells
[Environment]::SetEnvironmentVariable(
  "GIT_ACTIVITY_AUTHORS",
  "Your Name,your.email@example.com,alternate@email.com",
  "User"
)
```

## Usage

```bash
# Current week
bun run src/index.ts

# Previous weeks
bun run src/index.ts -w 1     # Last week
bun run src/index.ts -w 2     # Two weeks ago

# Custom date range
bun run src/index.ts --from 2026-01-01 --to 2026-01-15

# Options
bun run src/index.ts --path ~/projects    # Custom scan root (overrides current directory)
bun run src/index.ts --depth 4            # Scan depth
bun run src/index.ts --json               # JSON output

# Export reports
bun run src/index.ts --export csv         # Export to CSV file
bun run src/index.ts --export md          # Export to Markdown

# Cache management
bun run src/index.ts --refresh            # Force rescan repos (ignore cache)
bun run src/index.ts --clear-cache        # Remove cached repo list
```

## Agent activity

`git-activity agents` is a sibling report for **local AI-agent sessions** from Claude Code, Pi, Codex, GitHub Copilot CLI, VS Code Copilot Chat, Cursor, and OpenCode. Git remains the default command.

```bash
# Current week of agent sessions
bun run src/index.ts agents --json

# Last week
bun run src/index.ts agents -w 1 --export md

# Show what is installed locally
bun run src/index.ts agents --list

# Interactive picker (saved to ~/.git-activity/agents.json)
bun run src/index.ts agents --select
```

Hours come from session timestamps with a 15-minute minimum. Overlapping sessions on the same project are merged so two agents on one afternoon are not double-counted. Reports include metadata and truncated user prompts only — never assistant text or tool output.

## Combined activity

`git-activity all` folds both reports into one week: commits and agent sessions,
grouped by repository. Agent sessions are attributed to the git repo that
contains their working directory, so work on one project shows up as one row no
matter which directory the agent ran from.

```bash
# Current week of git + agent work
bun run src/index.ts all

# Last week, exported
bun run src/index.ts all -w 1 --export md

# Machine-readable (scan progress goes to stderr, so stdout stays pure JSON)
bun run src/index.ts all --json
```

```
╭─────────────────────────────────────────────────────────────────────────────
│ Week: Feb 16 - Feb 22, 2026                                  (Current Week)
│ ────────────────────────────────────────────────────────────────────────────
│ Thursday, Feb 19
│ ├── git-activity (~/Developer/too...  ~1.4h  2 commits  4 sessions  [claude]
│ └── api-service (~/Developer/proj...  ~5.5h  0 commits  4 sessions  [cursor]
│ ────────────────────────────────────────────────────────────────────────────
│ Weekly Total: ~6.9h across 2 projects (2 commits, 8 sessions)
│ Git ~1h · Agents ~6.6h · ~0.7h overlapped and counted once
```

Pressing `Enter` opens the day as a single chronological timeline, so a session
and the commits it produced sit next to each other:

```
│   time        source         what                                    hrs/sha
│ ────────────────────────────────────────────────────────────────────────────
│ ▸ 14:17       commit         feat: add activity stats and commit ... a7a72b3
│   14:22-14:38 claude         the new agents command does not work...   ~0.3h
│   16:19       commit         feat: complete agent source adapters... 48fa096
│
│ Estimated: ~1.4h  ·  2 commits  ·  4 sessions  ·  [claude]
│ Git ~1h and agents ~1.1h overlap; shared time counted once.
```

**Hours are not the sum of the two reports.** Git intervals and agent intervals
are merged, so a commit made inside a session window is counted once. The footer
shows each side's own total next to the merged one. `Enter` on a commit opens the
commit detail; `Enter` on a session opens the session detail.

## Interactive Navigation

The TUI has three levels: **week view** → **commit list** (or **timeline**, under
`all`) → **detail**.

| Key | Week view | Commit list / timeline | Detail |
|-----|-----------|------------------------|--------|
| `↑` / `↓` | Navigate rows | Navigate entries | — |
| `←` / `→` | Previous / next week | — | — |
| `Enter` | Open the selected day | Open the entry's detail | — |
| `Esc` / `Backspace` | — | Back to week view | Back to the list |
| `q` | Quit | Quit | Quit |

## Global Installation

To use `git-activity` as a global command:

```bash
# Option 1: Link with bun
bun link

# Option 2: Add to PATH
echo 'export PATH="$PATH:/path/to/git-activity"' >> ~/.zshrc
```

Then run from anywhere:

```bash
git-activity
git-activity -w 1 --export md
```

By default, `git-activity` scans the current directory as the root. Use `--path`
to scan a different location.

## How Time Estimation Works

The tool analyzes commit timestamps within each day and estimates work sessions:

- Commits within 2 hours of each other are grouped into sessions
- A 15-minute buffer is added before the first and after the last commit
- Minimum session time is 30 minutes
- Total hours are calculated from session durations

## Project Structure

```
src/
├── index.ts           # Entry point, Commander setup
├── report.ts          # Git weekly report + heatmap builders (shared by commands)
├── dates.ts           # Shared week / date-range parsing
├── scanner.ts         # Git repository discovery
├── git.ts             # Git log parsing
├── time-estimator.ts  # Work time estimation logic
├── cache.ts           # Repo cache management (~/.git-activity)
├── export.ts          # CSV/Markdown report generation
├── types.ts           # TypeScript interfaces
├── agents/            # Agent activity (detection, source adapters, report)
├── combined/          # Combined git + agent report (matching, hours, export)
└── ui/
    ├── App.tsx           # Main Ink component, keyboard input, week navigation
    ├── WeekView.tsx      # Weekly summary table
    ├── CommitList.tsx    # Commit list grouped by branch (with navigation)
    ├── CommitDetail.tsx  # Single commit detail (files changed, metadata)
    ├── AgentApp.tsx      # Agent week TUI
    ├── AgentPicker.tsx   # First-run / --select multi-select
    ├── SessionList.tsx   # Agent sessions for a project/day, grouped by source
    ├── SessionDetail.tsx # Session metadata and user prompts only
    ├── CombinedApp.tsx   # Combined week TUI
    ├── CombinedWeekView.tsx # Combined weekly summary
    ├── TimelineView.tsx  # One project/day as interleaved commits and sessions
    ├── sessionRows.ts    # Session grouping, column widths, scroll windows
    ├── timelineRows.ts   # Timeline column widths and row cells
    ├── format.ts         # Shared truncation and model-name formatting
    ├── DayDetail.tsx     # Daily breakdown (unused/legacy)
    ├── Heatmap.tsx       # Activity heatmap
    ├── useNavigation.ts  # View state and keyboard navigation hook
    └── useTerminalDimensions.ts # Terminal size hook
```

## License

MIT
