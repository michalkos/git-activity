import { $ } from "bun";
import type { GitCommit, GitRepo } from "./types.ts";

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
