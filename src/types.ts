export interface GitCommit {
  hash: string;
  date: Date;
  message: string;
  branch: string;
  author: string;
  email: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

export interface GitRepo {
  path: string;
  name: string;
  lastScanned?: Date;
}

export interface WorkSession {
  start: Date;
  end: Date;
  commits: GitCommit[];
}

export interface DayActivity {
  date: Date;
  commits: GitCommit[];
  sessions: WorkSession[];
  estimatedHours: number;
}

export interface ProjectActivity {
  repo: GitRepo;
  days: Map<string, DayActivity>; // key: YYYY-MM-DD
  totalCommits: number;
  totalHours: number;
}

export interface WeeklyReport {
  startDate: Date;
  endDate: Date;
  projects: ProjectActivity[];
  totalCommits: number;
  totalHours: number;
}

export interface RepoCache {
  repos: GitRepo[];
  lastUpdated: Date;
  scanPath: string;
  scanDepth: number;
}

export interface CLIOptions {
  path: string;
  depth: number;
  from?: Date;
  to?: Date;
  json: boolean;
  export?: 'csv' | 'md';
  refresh: boolean;
  clearCache: boolean;
}

export interface HeatmapData {
  date: Date;
  commits: number;
  intensity: 'none' | 'low' | 'medium' | 'high';
}

export type ViewState =
  | { view: 'week' }
  | { view: 'commits'; projectPath: string; date: string }
  | { view: 'commit-detail'; projectPath: string; date: string; commitHash: string };

export interface FileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R'; // Added, Modified, Deleted, Renamed
}

export interface CommitDetails {
  hash: string;
  subject: string;
  body: string;
  author: string;
  email: string;
  date: Date;
  files: FileChange[];
}
