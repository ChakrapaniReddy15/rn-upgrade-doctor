export type Severity = 'blocker' | 'warning' | 'info';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  package?: string;
  fix?: string;
  /** Where the data came from, e.g. "npm registry", "React Native Directory", "APK scan". */
  source: string;
}

export interface ScanOptions {
  cwd: string;
  apk?: string;
  format: Array<'terminal' | 'html' | 'md' | 'json'>;
  ci: boolean;
  offline: boolean;
}

export interface ProjectContext {
  cwd: string;
  reactNativeVersion?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  /** Installed versions resolved from the lockfile. */
  installed: Record<string, string>;
}

export interface Report {
  meta: { tool: string; version: string; scannedAt: string; cwd: string; apk?: string };
  summary: { blockers: number; warnings: number; ok: number };
  findings: Finding[];
}
