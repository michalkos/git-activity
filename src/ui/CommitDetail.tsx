import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { GitRepo } from "../types.ts";
import { getCommitDetails } from "../git.ts";
import type { CommitDetails } from "../types.ts";

interface CommitDetailProps {
  repo: GitRepo;
  commitHash: string;
  terminalWidth: number;
}

export function CommitDetail({ repo, commitHash, terminalWidth }: CommitDetailProps) {
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      setError(null);
      try {
        const result = await getCommitDetails(repo.path, commitHash);
        if (result) {
          setDetails(result);
        } else {
          setError("Failed to load commit details");
        }
      } catch {
        setError("Failed to load commit details");
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [repo.path, commitHash]);

  if (loading) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>[Esc] Back</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Loading commit details...</Text>
        </Box>
      </Box>
    );
  }

  if (error || !details) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>[Esc] Back</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="red">{error || "Failed to load commit details"}</Text>
        </Box>
      </Box>
    );
  }

  const formatDate = (date: Date) => {
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    return date.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'A':
        return "green";
      case 'M':
        return "yellow";
      case 'D':
        return "red";
      case 'R':
        return "cyan";
      default:
        return "white";
    }
  };

  const getStatusSymbol = (status: string) => {
    switch (status) {
      case 'A':
        return "+";
      case 'M':
        return "~";
      case 'D':
        return "-";
      case 'R':
        return "→";
      default:
        return "?";
    }
  };

  return (
    <Box flexDirection="column" width={terminalWidth}>
      {/* Header with back hint */}
      <Box borderStyle="single" paddingBottom={1} marginBottom={1}>
        <Text bold>[Esc] Back</Text>
      </Box>

      {/* Commit hash */}
      <Box>
        <Text bold color="cyan">
          Commit: {details.hash}
        </Text>
      </Box>

      {/* Author */}
      <Box marginTop={1}>
        <Text dimColor>Author: </Text>
        <Text>{details.author}</Text>
        <Text dimColor> &lt;{details.email}&gt;</Text>
      </Box>

      {/* Date */}
      <Box marginTop={1}>
        <Text dimColor>Date: </Text>
        <Text>{formatDate(details.date)}</Text>
      </Box>

      {/* Subject */}
      <Box marginTop={1}>
        <Text bold>Subject: {details.subject}</Text>
      </Box>

      {/* Body */}
      {details.body && (
        <Box marginTop={1} flexDirection="column">
          <Text bold dimColor>Body:</Text>
          <Box marginTop={1}>
            <Text>{details.body}</Text>
          </Box>
        </Box>
      )}

      {/* Files */}
      {details.files.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold dimColor>
            Files changed ({details.files.length}):
          </Text>
          <Box marginTop={1} flexDirection="column">
            {details.files.map((file, index) => (
              <Box key={index}>
                <Text color={getStatusColor(file.status)}>
                  {getStatusSymbol(file.status)} {file.path}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
