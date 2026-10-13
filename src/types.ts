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

export type ReportFormat = 'terminal' | 'html' | 'md' | 'json';

export interface ScanOptions {
  cwd: string;
  apk?: string;
  format: ReportFormat[];
  ci: boolean;
  offline: boolean;
  /** Registry cache folder. Default: $RN_UPGRADE_DOCTOR_CACHE_DIR, else ~/.cache/rn-upgrade-doctor. */
  cacheDir?: string;
}

/** A value fetched from a remote source, labelled with where it came from. */
export interface Sourced<T> {
  value?: T;
  /** e.g. "npm registry", "npm registry (cache)", "offline, not cached", "not on npm". */
  source: string;
}

export interface NpmPackageInfo {
  latest: string;
  deprecated?: string;
}

export type NewArchStatus = 'supported' | 'unsupported' | 'untested' | 'new-arch-only';

export interface DirectoryInfo {
  newArchitecture?: NewArchStatus;
  unmaintained: boolean;
}

export interface DependencyInfo {
  name: string;
  /** Range from package.json. */
  declared: string;
  /** Exact version from the lockfile. */
  installed?: string;
  dev: boolean;
  npm: Sourced<NpmPackageInfo>;
  /** Undefined value means the library is not listed in React Native Directory. */
  directory: Sourced<DirectoryInfo>;
}

export interface AndroidConfig {
  minSdk?: number;
  compileSdk?: number;
  targetSdk?: number;
  ndkVersion?: string;
  kotlinVersion?: string;
  gradleVersion?: string;
  newArchEnabled?: boolean;
  hermesEnabled?: boolean;
  /** Files the values were read from, relative to the project. */
  files: string[];
}

export interface IosConfig {
  /** e.g. "15.1"; undefined when the Podfile uses RN's `min_ios_version_supported`. */
  minIos?: string;
  usesRnMinIos: boolean;
  newArchEnabled?: boolean;
  hermesEnabled?: boolean;
  /** React Native version recorded in Podfile.lock (React-Core). */
  podsReactNativeVersion?: string;
  cocoapodsVersion?: string;
  files: string[];
}

export interface PatchInfo {
  /** Path relative to the project. */
  file: string;
  package: string;
  /** Version the patch was made for (from the patch-package file name). */
  version?: string;
}

export interface NativeLib {
  /** Path inside the APK/AAB, e.g. "lib/arm64-v8a/libfoo.so". */
  path: string;
  abi: string;
  name: string;
  is64Bit: boolean;
  /** Smallest PT_LOAD alignment in bytes; undefined if the ELF could not be read. */
  loadAlign?: number;
  /** ELF segments aligned to 16 KB or more. Always true for 32-bit ABIs (not required there). */
  elfOk: boolean;
  /** Stored (uncompressed) in the zip. Only stored libs need 16 KB zip alignment. */
  stored: boolean;
  /** For stored libs in an APK: data offset in the zip is a multiple of 16 KB. */
  zipAligned?: boolean;
  package?: string;
  packageSource?: string;
}

export interface ApkReport {
  file: string;
  kind: 'apk' | 'aab';
  libs: NativeLib[];
}

export interface ProjectContext {
  cwd: string;
  /** Exact version from the lockfile, else the lowest version allowed by the package.json range. */
  reactNativeVersion?: string;
  reactNativeVersionSource: 'lockfile' | 'package.json';
  /** The react-native range as written in package.json. */
  reactNativeRange?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  /** Installed versions of the direct dependencies, resolved from the lockfile. */
  installed: Record<string, string>;
  /** Declared direct dependencies: name -> range (dependencies and devDependencies). */
  declared: Record<string, string>;
  devOnly: string[];

  // Filled by runScan after the project files are read.
  latestReactNative?: Sourced<string>;
  dependencies?: DependencyInfo[];
  android?: AndroidConfig;
  ios?: IosConfig;
  patches?: PatchInfo[];
  apk?: ApkReport;
}

export interface Report {
  meta: {
    tool: string;
    version: string;
    scannedAt: string;
    cwd: string;
    apk?: string;
    reactNativeVersion?: string;
    reactNativeVersionSource: ProjectContext['reactNativeVersionSource'];
    latestReactNative?: string;
    latestReactNativeSource?: string;
    upgradeHelperUrl?: string;
    packageManager?: ProjectContext['packageManager'];
    offline: boolean;
  };
  summary: { blockers: number; warnings: number; info: number };
  findings: Finding[];
  dependencies: DependencyInfo[];
  android?: AndroidConfig;
  ios?: IosConfig;
  patches: PatchInfo[];
  apk?: ApkReport;
}
