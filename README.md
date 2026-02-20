# Git Activity Tracker

A Bun-based CLI tool that scans directories for git repositories and generates weekly activity reports for your commits.

## Features

- Recursive git repository discovery with configurable depth
- Work time estimation based on commit timestamps
- Interactive TUI with keyboard navigation
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

## Interactive Navigation

The TUI has three levels: **week view** → **commit list** → **commit detail**.

| Key | Week view | Commit list | Commit detail |
|-----|-----------|-------------|---------------|
| `↑` / `↓` | Navigate rows | Navigate commits | — |
| `←` / `→` | Previous / next week | — | — |
| `Enter` | Open commit list for selected day | Open commit detail | — |
| `Esc` / `Backspace` | — | Back to week view | Back to commit list |
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
├── scanner.ts         # Git repository discovery
├── git.ts             # Git log parsing
├── time-estimator.ts  # Work time estimation logic
├── cache.ts           # Repo cache management (~/.git-activity)
├── export.ts          # CSV/Markdown report generation
├── types.ts           # TypeScript interfaces
└── ui/
    ├── App.tsx           # Main Ink component, keyboard input, week navigation
    ├── WeekView.tsx      # Weekly summary table
    ├── CommitList.tsx    # Commit list grouped by branch (with navigation)
    ├── CommitDetail.tsx  # Single commit detail (files changed, metadata)
    ├── DayDetail.tsx     # Daily breakdown (unused/legacy)
    ├── Heatmap.tsx       # Activity heatmap
    ├── useNavigation.ts  # View state and keyboard navigation hook
    └── useTerminalDimensions.ts # Terminal size hook
```

## License

MIT
