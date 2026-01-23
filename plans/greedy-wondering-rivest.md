# Git Activity Tracker CLI

A Bun-based CLI tool that scans directories for git repositories and generates weekly activity reports for your commits.

## Project Structure

```
~/Developer/projects/git-activity/
├── src/
│   ├── index.ts           # Entry point, Commander setup
│   ├── scanner.ts         # Git repository discovery
│   ├── git.ts             # Git log parsing
│   ├── time-estimator.ts  # Work time estimation logic
│   ├── cache.ts           # Repo cache management (~/.git-activity)
│   ├── export.ts          # CSV/Markdown report generation
│   ├── types.ts           # TypeScript interfaces
│   └── ui/
│       ├── App.tsx           # Main Ink component, navigation state
│       ├── WeekView.tsx      # Weekly summary table (selectable rows)
│       ├── DayDetail.tsx     # Daily breakdown per project
│       ├── CommitList.tsx    # Detailed commit messages view
│       ├── Heatmap.tsx       # GitHub-style activity heatmap
│       └── useNavigation.ts  # Keyboard navigation hook
├── .env.example           # Template for email configuration
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## Core Features

### 1. Repository Scanner (`scanner.ts`)
- Recursively scan directories for `.git` folders
- Configurable max depth (default: 3 levels)
- Exclude common directories (node_modules, .cache, etc.)

### 2. Git Log Parser (`git.ts`)
- Extract commits for configured authors
- Parse commit date, message, hash
- Filter by date range (week boundaries)

### 3. Time Estimator (`time-estimator.ts`)
- Analyze commit timestamps within a day
- Estimate work sessions based on:
  - Time between commits (gaps > 2h = new session)
  - Minimum session time: 30 min
  - Add buffer time before first/after last commit

### 4. CLI Interface (`index.ts`)
```bash
# Current week
git-activity

# Previous weeks
git-activity -1w
git-activity -2w

# Custom date range
git-activity --from 2026-01-01 --to 2026-01-15

# Options
git-activity --path ~/projects    # Custom scan path
git-activity --depth 4            # Scan depth
git-activity --json               # JSON output

# Export reports
git-activity --export csv         # Export to CSV file
git-activity --export md          # Export to Markdown

# Cache management
git-activity --refresh            # Force rescan repos (ignore cache)
git-activity --clear-cache        # Remove cached repo list
```

### 5. Repo Cache (`cache.ts`)
- Store discovered repos in `~/.git-activity/repos.json`
- Cache includes: repo path, name, last scan timestamp
- Auto-refresh if cache older than 24h or --refresh flag used
- Speeds up subsequent runs significantly

### 6. Export (`export.ts`)
- **CSV**: Time tracking format compatible with common timesheet tools
  ```csv
  Date,Project,Path,Hours,Commits
  2026-01-13,myapp,~/projects/myapp,3.5,4
  2026-01-13,api-service,~/projects/api,1.0,2
  ```
- **Markdown**: Weekly report format
  ```markdown
  # Week of Jan 13-19, 2026
  ## Monday, Jan 13
  - **myapp** (3.5h, 4 commits)
    - feat: Add user authentication
    - fix: Handle edge case in login flow
  ```

### 5. TUI Output (Ink)
```
┌──────────────────────────────────────────────────────────┐
│  Week: Jan 13 - Jan 19, 2026                             │
├──────────────────────────────────────────────────────────┤
│  Monday, Jan 13                                          │
│  ├── myapp (~/projects/myapp)           ~3.5h  4 commits │
│  └── api-service (~/projects/api)       ~1.0h  2 commits │
│                                                          │
│  Tuesday, Jan 14                                         │
│  └── myapp (~/projects/myapp)           ~5.0h  8 commits │
│                                                          │
│  ... (other days)                                        │
├──────────────────────────────────────────────────────────┤
│  Weekly Total: ~18.5h across 3 projects                  │
│                                                          │
│  [↑↓] Navigate  [Enter] View commits  [q] Quit           │
└──────────────────────────────────────────────────────────┘
```

### Activity Heatmap
GitHub-style contribution grid showing commit density:
```
         Mon Tue Wed Thu Fri Sat Sun
Week -2   ██  ░░  ▓▓  ██  ░░  ·   ·
Week -1   ▓▓  ██  ██  ▓▓  ░░  ·   ·
Current   ██  ▓▓  ░░  ·   ·   ·   ·
          └─ Intensity: · none  ░░ low  ▓▓ medium  ██ high
```

### Interactive Detail View
When selecting a project with Enter:
```
┌──────────────────────────────────────────────────────────┐
│  myapp - Monday, Jan 13                         [Esc] ←  │
├──────────────────────────────────────────────────────────┤
│  09:23  feat: Add user authentication                    │
│  10:45  fix: Handle edge case in login flow              │
│  11:30  refactor: Extract auth utils                     │
│  14:02  feat: Add password reset endpoint                │
│                                                          │
│  Estimated: ~3.5h (2 sessions)                           │
└──────────────────────────────────────────────────────────┘
```

## Configuration

### .env file
```env
# Comma-separated list of author identifiers
GIT_ACTIVITY_AUTHORS=Michal Kos,michal@example.com,mk@company.com

# Default scan path (optional)
GIT_SCAN_PATH=~/Developer/projects

# Max scan depth (optional)
GIT_SCAN_DEPTH=3
```

## Dependencies

```json
{
  "dependencies": {
    "commander": "^12.x",
    "ink": "^5.x",
    "ink-use-stdout-dimensions": "^2.x",
    "react": "^18.x",
    "dotenv": "^16.x",
    "date-fns": "^3.x",
    "chalk": "^5.x"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^18.x"
  }
}
```

Note: Ink's `useInput` hook provides keyboard input handling out of the box.
```

## Implementation Steps

1. **Initialize project**
   - Create directory structure
   - Initialize Bun project with `bun init`
   - Install dependencies
   - Configure TypeScript for JSX

2. **Create core modules**
   - `types.ts` - Define interfaces for commits, repos, sessions
   - `scanner.ts` - Implement recursive git repo discovery
   - `git.ts` - Implement git log parsing with Bun shell
   - `time-estimator.ts` - Implement work session estimation
   - `cache.ts` - Repo caching in ~/.git-activity/repos.json
   - `export.ts` - CSV and Markdown report generation

3. **Create CLI**
   - `index.ts` - Set up Commander with all options
   - Parse week offset (-1w, -2w) and date range (--from/--to)
   - Handle export flags (--export csv/md)
   - Cache management flags (--refresh, --clear-cache)
   - Load .env configuration

4. **Create TUI components**
   - `App.tsx` - Main container, view state management
   - `WeekView.tsx` - Weekly summary with selectable project rows
   - `Heatmap.tsx` - Activity grid showing 3-week history
   - `DayDetail.tsx` - Per-day project breakdown
   - `CommitList.tsx` - Detailed commit messages for selected project/day
   - `useNavigation.ts` - Hook for ↑↓/Enter/Esc keyboard handling
   - Support drill-down: Week → Day/Project → Commit details

5. **Add finishing touches**
   - `.env.example` with documentation
   - Error handling for missing git/repos
   - Make executable with shebang
   - Add to PATH instructions in README

## Verification

1. Run `bun run src/index.ts` in a directory with git repos
2. Test week offset: `bun run src/index.ts -1w`
3. Test custom date range: `bun run src/index.ts --from 2026-01-01 --to 2026-01-07`
4. Verify commit filtering works with configured emails
5. Check time estimation produces reasonable results
6. Test interactive navigation (↑↓ to select, Enter for details, Esc to go back)
7. Verify heatmap displays correctly with recent activity
8. Test export: `bun run src/index.ts --export csv` and `--export md`
9. Test caching: second run should be faster, `--refresh` should rescan
10. Test with `--json` flag for machine-readable output
