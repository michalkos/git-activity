import { $ } from "bun";
import type { GitCommit, GitRepo, CommitDetails, FileChange } from "./types.ts";

const COMMIT_SEPARATOR = "---COMMIT---";
const FIELD_SEPARATOR = "|||";

export async function getCommits(
  repo: GitRepo,
  authors: string[],
  from: Date,
  to: Date
): Promise<GitCommit[]> {
  const commits: GitCommit[] = [];

  // Format dates for git log
  // Git's --after is exclusive, so subtract 1 day to include commits on the start date
  const dayBefore = new Date(from);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const afterDate = formatDateForGit(dayBefore);
  const beforeDate = formatDateForGit(to);

  // Build author filter (git log uses OR for multiple --author flags)
  const authorArgs = authors.flatMap((a) => ["--author", a]);

  try {
    // Use a custom format to parse commits
    // %H = hash, %aI = author date ISO, %s = subject, %S = source ref, %D = decorations,
    // %an = author name, %ae = author email
    const format = `${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%S${FIELD_SEPARATOR}%D${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae`;

    const result = await $`git -C ${repo.path} log --all --source --numstat --after=${afterDate} --before=${beforeDate} ${authorArgs} --format=${format}`.quiet().text();

    if (!result.trim()) {
      return commits;
    }

    const lines = result.split(COMMIT_SEPARATOR).filter((line) => line.trim());

    for (const line of lines) {
      const commitLines = line
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      const parts = (commitLines[0] || "").split(FIELD_SEPARATOR);
      if (parts.length >= 7) {
        const [hash, dateStr, message, sourceRef, decorations, author, email] = parts;
        let additions = 0;
        let deletions = 0;
        let filesChanged = 0;
        for (const statLine of commitLines.slice(1)) {
          const [added, deleted, filePath] = statLine.split("\t");
          if (added === undefined || deleted === undefined || filePath === undefined) continue;
          const addedCount = Number(added);
          const deletedCount = Number(deleted);
          if (!Number.isNaN(addedCount)) {
            additions += addedCount;
          }
          if (!Number.isNaN(deletedCount)) {
            deletions += deletedCount;
          }
          filesChanged += 1;
        }

        commits.push({
          hash: hash!,
          date: new Date(dateStr!),
          message: message!,
          branch: resolveBranchName(sourceRef || "", decorations || ""),
          author: author!,
          email: email!,
          additions,
          deletions,
          filesChanged,
        });
      }
    }
  } catch (error) {
    // Repository might not have commits or git might fail
    // Silently skip
  }

  // Sort by date ascending
  commits.sort((a, b) => a.date.getTime() - b.date.getTime());

  return commits;
}

function resolveBranchName(sourceRef: string, decorations: string): string {
  const normalizedSource = normalizeRefName(sourceRef.trim());
  if (normalizedSource) {
    return normalizedSource;
  }

  const fromDecorations = inferBranchFromDecorations(decorations);
  if (fromDecorations) {
    return fromDecorations;
  }

  return "unknown";
}

function normalizeRefName(refName: string): string | null {
  if (!refName) return null;

  if (refName.startsWith("refs/heads/")) {
    return refName.slice("refs/heads/".length);
  }

  if (refName.startsWith("refs/remotes/")) {
    return refName.slice("refs/remotes/".length);
  }

  if (refName === "HEAD") {
    return "HEAD";
  }

  return refName;
}

function inferBranchFromDecorations(decorations: string): string | null {
  if (!decorations.trim()) {
    return null;
  }

  const refs = decorations
    .split(",")
    .map((ref) => ref.trim())
    .flatMap((ref) => {
      // Handle "HEAD -> main" syntax by considering both parts.
      if (ref.includes("->")) {
        return ref.split("->").map((part) => part.trim());
      }
      return [ref];
    });

  for (const ref of refs) {
    const normalized = normalizeRefName(ref);
    if (normalized && normalized !== "HEAD") {
      return normalized;
    }
  }

  return refs.length > 0 ? refs[0] || null : null;
}

function formatDateForGit(date: Date): string {
  // Use local date to avoid UTC day shifts in --after/--before boundaries.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getAuthorsFromEnv(): string[] {
  const authorsEnv = process.env.GIT_ACTIVITY_AUTHORS || "";
  return authorsEnv
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

export async function getCommitDetails(
  repoPath: string,
  commitHash: string
): Promise<CommitDetails | null> {
  try {
    // Use non-printable separators to avoid collisions with commit content.
    const fieldSeparator = "\x1f";
    const format = `%s%x1f%b%x1f%an%x1f%ae%x1f%aI`;
    const messageResult =
      await $`git -C ${repoPath} log -1 --format=${format} ${commitHash}`.quiet().text();

    if (!messageResult.trim()) {
      return null;
    }

    const parts = messageResult.split(fieldSeparator);
    if (parts.length < 5) {
      return null;
    }

    const [subject, body, author, email, dateStr] = parts;

    // Get file changes
    const filesResult = await $`git -C ${repoPath} diff-tree --no-commit-id --name-status -r ${commitHash}`.quiet().text();

    const files: FileChange[] = [];
    if (filesResult.trim()) {
      const lines = filesResult.split("\n").filter((line) => line.trim());
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        const statusChar = trimmed[0]!.toUpperCase();
        const path = trimmed.slice(1).trim();

        if (statusChar === 'A' || statusChar === 'M' || statusChar === 'D' || statusChar === 'R') {
          files.push({ path, status: statusChar });
        }
      }
    }

    return {
      hash: commitHash,
      subject: subject || "",
      body: body || "",
      author: author || "",
      email: email || "",
      date: new Date((dateStr || "").trim()),
      files,
    };
  } catch {
    return null;
  }
}
