# Git Activity Tracker

A Bun-based CLI tool that scans directories for git repositories and generates weekly activity reports for your commits.

## Features

- Recursive git repository discovery with configurable depth
- Work time estimation based on commit timestamps
- Interactive TUI with keyboard navigation
- GitHub-style activity heatmap
- Export to CSV and Markdown formats
- Repository caching for faster subsequent runs

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
GIT_AUTHORS=Your Name,your.email@example.com,alternate@email.com

# Default scan path (optional)
GIT_SCAN_PATH=~/Developer/projects

# Max scan depth (optional)
GIT_SCAN_DEPTH=3
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
bun run src/index.ts --path ~/projects    # Custom scan path
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

- `↑`/`↓` - Navigate between projects/days
- `←`/`→` - Navigate to previous/next week
- `Enter` - View commit details for selected project/day
- `Esc` - Go back to week view
- `q` - Quit

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
    ├── App.tsx           # Main Ink component
    ├── WeekView.tsx      # Weekly summary table
    ├── DayDetail.tsx     # Daily breakdown
    ├── CommitList.tsx    # Commit messages view
    ├── Heatmap.tsx       # Activity heatmap
    └── useNavigation.ts  # Keyboard navigation hook
```

## License

MIT
