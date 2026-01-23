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
  const afterDate = formatDateForGit(from);
  const beforeDate = formatDateForGit(to);

  // Build author filter (git log uses OR for multiple --author flags)
  const authorArgs = authors.flatMap((a) => ["--author", a]);

  try {
    // Use a custom format to parse commits
    // %H = hash, %aI = author date ISO, %s = subject, %an = author name, %ae = author email
    const format = `${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae`;

    const result = await $`git -C ${repo.path} log --all --after=${afterDate} --before=${beforeDate} ${authorArgs} --format=${format}`.quiet().text();

    if (!result.trim()) {
      return commits;
    }

    const lines = result.split(COMMIT_SEPARATOR).filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.trim().split(FIELD_SEPARATOR);
      if (parts.length >= 5) {
        const [hash, dateStr, message, author, email] = parts;
        commits.push({
          hash: hash!,
          date: new Date(dateStr!),
          message: message!,
          author: author!,
          email: email!,
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

function formatDateForGit(date: Date): string {
  // Git accepts ISO format
  return date.toISOString().split("T")[0]!;
}

export function getAuthorsFromEnv(): string[] {
  const authorsEnv = process.env.GIT_AUTHORS || "";
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
    // Get commit message details: subject, body, author, email, date
    const format = "%s|%b|%an|%ae|%aI";
    const messageResult = await $`git -C ${repoPath} log -1 --format=${format} ${commitHash}`.quiet().text();

    if (!messageResult.trim()) {
      return null;
    }

    const parts = messageResult.split("|");
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
      date: new Date(dateStr || ""),
      files,
    };
  } catch {
    return null;
  }
}
