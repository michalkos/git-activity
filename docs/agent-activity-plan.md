# Agent Activity

Plan for a second report mode that summarizes **local AI-agent work** the same way `git-activity` summarizes git commits: weekly hours, per-project breakdown, heatmap, drill-down, JSON/CSV/Markdown export.

Git remains the default. Agent activity is a sibling command, not a rewrite.

```bash
git-activity agents                 # current week, using saved agent selection
git-activity agents -w 1            # last week
git-activity agents --select        # pick which detected agents to include
git-activity agents --list          # print detection table and exit
git-activity agents --agents claude,pi,cursor
```

## Goal

Answer: *where did I spend agent time this week, on which projects, with which tools?*

Same UX shape as git activity:

```
Week: Feb 16 - Feb 22, 2026
Monday, Feb 16
└── git-activity (~/Developer/projects/git-activity)   ~2h  3 sessions  [claude, cursor]
Wednesday, Feb 18
├── api-service                                        ~1.5h  2 sessions  [codex]
└── frontend-app                                       ~0.5h  1 session   [pi]
Weekly Total: ~4h across 3 projects  (12 sessions)
```

Enter a row → session list for that project/day (source, title, duration, model). Enter again → session detail (user prompts only, truncated; no full transcripts).

## Decisions

These are the defaults unless we change them during implementation:

1. **Separate command, shared date flags.** Do not mix git commits and agent sessions in one table yet. Combining later is a follow-up.
2. **Group by project (cwd), tag by agent.** Git groups by repo. Agents group by working directory. Agent name is a label, like branch is today.
3. **Hours come from session timestamps, then merge overlaps.** Do not reuse the git 2-hour-gap heuristic as the primary signal. An agent session already *is* a work session. If two agents ran on the same project in overlapping windows, merge intervals so the day total is not double-counted.
4. **Local files only.** No GitHub / Cursor Cloud / Copilot Chronicle APIs in v1. Cloud agents that leave a local transcript (Cursor `agent-transcripts`) are included; purely remote history is not.
5. **Detect from binary *or* data directory.** A tool counts as present if its CLI is on `PATH` or its session directory exists. The picker shows session counts so empty installs are obvious.
6. **Persist selection, not detection.** Detection runs every time. Enabled sources are stored in `~/.git-activity/agents.json`. First run with no config opens the picker.
7. **Privacy: metadata + first user prompt.** Reports never dump assistant text, thinking, or tool output. Detail view shows truncated user turns and counts only.
8. **Adapters are best-effort.** Session formats are undocumented internals except Pi. A broken adapter must skip that source and keep the rest of the report working.

## How it maps onto today

Current pipeline:

```
scan repos → git log → group by day → estimate hours → TUI / export
```

Agent pipeline:

```
detect agents → filter by selection → each adapter lists sessions in range
  → group by project cwd → merge overlapping intervals → TUI / export
```

Reuse as-is: date-range flags (`-w`, `--from`, `--to`), heatmap week navigation, JSON/CSV/Markdown export shape, cache dir `~/.git-activity/`.

Do **not** force `GitCommit` / `ProjectActivity` to represent agents. Parallel types, shared grouping helpers. Extract a generic week view only if duplication actually hurts.

```
src/
  agents/
    types.ts              # AgentSession, AgentSourceId, DetectedAgent
    detect.ts             # PATH + data-dir probes
    select.ts             # picker + ~/.git-activity/agents.json
    report.ts             # build weekly report from sessions
    hours.ts              # interval merge / day totals
    sources/
      types.ts            # AgentSource adapter interface
      claude.ts
      pi.ts
      codex.ts
      copilot.ts          # GitHub Copilot CLI
      vscode-copilot.ts
      cursor.ts
  ui/
    AgentPicker.tsx       # first-run / --select
    SessionList.tsx       # analog of CommitList
    SessionDetail.tsx     # analog of CommitDetail (prompts only)
```

CLI: add a Commander subcommand `agents` on the existing `git-activity` binary. Optional later alias: `"agent-activity": "./src/index.ts"`.

## Unified model

```ts
type AgentSourceId =
  | "pi"
  | "copilot"          // GitHub Copilot CLI (+ Desktop if it shares ~/.copilot)
  | "vscode-copilot"   // VS Code Copilot Chat
  | "codex"
  | "claude"
  | "cursor";

interface AgentSession {
  id: string;
  source: AgentSourceId;
  title: string;            // session name, else first user prompt, truncated
  projectPath: string;      // cwd / workspace folder
  projectName: string;      // basename(projectPath)
  startedAt: Date;
  endedAt: Date;
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  model?: string;
}

interface AgentSource {
  id: AgentSourceId;
  label: string;
  detect(): Promise<Detection>;     // { installed, dataDir?, binary?, sessionCount }
  listSessions(from: Date, to: Date): Promise<AgentSession[]>;
}
```

Week report mirrors `WeeklyReport`, but `projects[].days` hold `AgentSession[]` instead of `GitCommit[]`, and hours are merged interval totals.

**Streaming parse rule:** adapters must not load a whole transcript when metadata is enough. Prefer headers, indexes, SQLite summary tables, and file mtime. Fall back to scanning JSONL only for first/last timestamp + first user message.

## Detection and selection

### Detection

| Source | Binary | Data (macOS / Linux / Windows) |
|--------|--------|--------------------------------|
| **pi** | `pi` | `~/.pi/agent/sessions/` (`PI_CODING_AGENT_SESSION_DIR` / `PI_CODING_AGENT_DIR` override) |
| **copilot** | `copilot` | `~/.copilot/session-state/` (`COPILOT_HOME` override) |
| **vscode-copilot** | `code` | `{Code}/User/workspaceStorage/*/chatSessions/` |
| **codex** | `codex` | `~/.codex/sessions/` |
| **claude** | `claude` | `~/.claude/projects/` |
| **cursor** | `cursor` | `~/.cursor/` and `{Cursor}/User/` |

Editor data roots:

- macOS: `~/Library/Application Support/{Code,Cursor}`
- Linux: `~/.config/{Code,Cursor}`
- Windows: `%APPDATA%/{Code,Cursor}`

Also probe VS Code Insiders (`Code - Insiders`) as the same `vscode-copilot` source. Cursor Copilot Chat, if present, is ignored — Cursor's own agent transcripts cover that IDE.

`--list` output:

```
claude          installed   ~/.claude/projects          42 sessions
cursor          installed   ~/.cursor                   18 sessions
pi              installed   ~/.pi/agent/sessions         7 sessions
codex           installed   ~/.codex/sessions            3 sessions
copilot         missing     —
vscode-copilot  installed   ~/.config/Code/...           11 sessions
```

### Selection

Ink multi-select of **detected** sources. Space toggles, Enter saves.

Saved at `~/.git-activity/agents.json`:

```json
{ "enabled": ["claude", "cursor", "pi"] }
```

Priority: `--agents` flag > saved config > first-run picker. If `--json` / `--export` and nothing is saved, include every detected source that has sessions (non-interactive).

## Time estimation

Per session: `endedAt - startedAt`. Apply a 15-minute minimum so a one-prompt poke still shows up. No extra before/after buffers — the transcript already spans the work.

Per day / project: collect `[startedAt, endedAt]` intervals from all enabled agents, sort, merge overlaps, sum. That is the number shown as `~2h`.

Session *count* stays unmerged (3 sessions from two agents still reads `3 sessions`). Heatmap intensity uses session count, same buckets as commits today.

Overnight sessions land on the start day's row (same as a late-night git commit).

## TUI and export

- Week view: reuse layout; swap `commits` copy for `sessions`; append `[agent, agent]` tags.
- Session list: time range, source, title, model, duration.
- Session detail: source, project, model, turn/tool counts, truncated user prompts. No assistant/tool bodies.
- Heatmap: same 3-week widget; `HeatmapData.commits` can stay as a generic count for now.
- Export: `Date,Project,Path,Hours,Sessions,Agents` plus optional session titles in Markdown. JSON includes `source` on each session.
- Files: `agent-activity-YYYY-MM-DD.{csv,md}` so they do not collide with git exports.

## Source adapters (v1 set)

Formats below are what local tools actually write today. Treat all except Pi as unstable.

### 1. Claude Code — ship first

Cleanest analog of `git log`. Prove the report UX here before the messy sources.

- Path: `~/.claude/projects/<cwd-encoded>/*.jsonl`
- Each file is one session. Lines are events with `type`, `timestamp`, `sessionId`, `cwd`.
- Use `type: "user"` with real text (not `tool_result`) for the title and user-turn count; first and last event timestamps for duration; `cwd` from any event (usually stable).
- Default retention is ~30 days (`cleanupPeriodDays` in `~/.claude/settings.json`). The report can only see what is still on disk.

### 2. Pi

Documented JSONL.

- Path: `~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/<timestamp>_<uuid>.jsonl`
- Header line: `{ type: "session", cwd, timestamp, id }`. Optional later `session_info` entry supplies a display name.
- User/assistant timestamps live on message entries. Cwd is in the header, so listing can stay metadata-cheap.

### 3. Codex CLI

- Path: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- Index: `~/.codex/session_index.jsonl` (id, name, last updated). Archived copies live under `~/.codex/archived_sessions/`.
- Prefer the index for the date filter; open the JSONL only for cwd / first prompt if the index lacks them.
- Date-sharded directories make range scans cheap.

### 4. GitHub Copilot CLI (`copilot`)

Separate from VS Code Chat on purpose — they do not share a local store.

- Path: `~/.copilot/session-state/<uuid>/`
- Per session: `workspace.yaml` (cwd, timestamps, title), `events.jsonl` when present.
- Summary DB: `~/.copilot/session-store.db` (read-only). Prefer it for list+filter; fall back to `workspace.yaml` + mtime.
- Copilot Desktop that writes into `~/.copilot` is the same source. Do not add a seventh id for it.

### 5. VS Code GitHub Copilot Chat

- Path: `{Code}/User/workspaceStorage/<hash>/chatSessions/*.json`
- Map `<hash>` → folder via `workspace.json` in the same storage dir.
- Each JSON file is one chat. Parse creation / last-message timestamps and the first user request. Schema has shifted across VS Code versions — isolate parsing and skip files that do not match.
- Scan all workspace hashes; do not require `--path`.

### 6. Cursor — last, hardest

There is no single transcript directory. Three overlapping stores:

| Store | Path | Use |
|-------|------|-----|
| Agent transcripts | `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` | **v1 source of truth** — closest to Claude |
| Chat DBs | `~/.cursor/chats/*/*/store.db` | Metadata (name, model, createdAt) when JSONL is thin |
| Composer state | `{Cursor}/User/globalStorage/state.vscdb` keys `composerData:*` / `bubbleId:*` | Only if transcripts miss IDE chats |

v1: parse JSONL transcripts + `store.db` meta. Do not replay `composerData` / `bubbleId` / `agentKv` until the simple path is clearly missing sessions. `~/.cursor/ai-tracking/ai-code-tracking.db` is attribution, not a session log — out of scope.

Project path: decode from `~/.cursor/projects/<encoded-cwd>/`. Session id from the JSONL filename.

## Phased delivery

### Phase 0 — foundation (no real adapters yet)

- `AgentSource` interface, `detect.ts`, `agents.json`, Ink picker.
- `git-activity agents --list` and `--select`.
- Empty-state TUI: "no agents enabled".

### Phase 1 — Claude + shared report

- Claude adapter.
- `report.ts` / `hours.ts`.
- Week view, session list, session detail, heatmap, `--json` / `--export`.
- This is the first usable command.

### Phase 2 — documented / indexed CLIs

- Pi, Codex, Copilot CLI.
- Same TUI. Tags start showing multiple sources per project.

### Phase 3 — editor stores

- VS Code Copilot Chat.
- Cursor transcripts + `store.db` meta.

### Phase 4 — harden

- Overlap merging across agents (if not already in phase 1).
- Adapter tests against fixture JSONL/SQLite snippets (no live home-dir dependency).
- Skip unreadable files with a one-line stderr warning, never abort the report.
- Optional `--path` filter to keep only sessions whose cwd is under a root (parity with git `--path`).

Do not wait for phase 4 to merge 1–3. Each phase should be shippable.

## Out of scope (v1)

- Merged git + agent week view
- Cloud-only history (Cursor Cloud dashboard, Copilot Chronicle sync, Claude Desktop web chats)
- Token/cost totals
- JetBrains Copilot, Windsurf, Cline, Aider, OpenCode, Gemini CLI
- Writing back to agent stores
- WSL reading native Windows AppData (call it out if we hit it)

## Risks

- **Format drift.** Copilot, Cursor, and VS Code stores are internal. Keep each parser in its own file with fixtures; fail that source, not the process.
- **Huge files.** Cursor `state.vscdb` can be >1GB. Never full-scan it in v1. JSONL adapters stream line-by-line and stop after they have start/end/title.
- **SQLite locks.** Open Copilot/Cursor DBs read-only (`bun:sqlite`). If locked, skip that session.
- **Path encoding.** Claude and Pi encode cwd in directory names (`/` → `-`). Always prefer `cwd` inside the file when present.
- **Double counting.** Same work in Cursor and git is expected — different commands. Same work in Cursor *and* Claude on one afternoon is overlap-merged in the agent view.
- **Retention.** Claude may drop sessions after 30 days. Report what exists; do not warn unless `--list` shows zero Claude sessions while `claude` is installed.

## Implementation notes

- Bun `bun:sqlite` for Copilot and Cursor DBs — no extra native dep.
- Probe binaries with `Bun.which("claude")` (and friends), not a shell.
- Expand `~` the same way `scanner.ts` already does.
- Tests: fixture directories under `src/agents/sources/fixtures/`. One golden session per adapter is enough; do not snapshot megabyte vscdb files.
- Keep comments on adapters pointing at the on-disk layout, and update them when a format breaks.

## Suggested first PR after this plan

Phase 0 + Phase 1 only: detection, picker, Claude adapter, agent week TUI, export. That is enough to validate the product before investing in Cursor's storage stack.
