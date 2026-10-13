# Changelog

## 0.1.0 — 2026-10-13

First release.

- **React Native version gap** to the latest release, with a link to the official upgrade-helper diff; warnings for the
  New Architecture-only releases (0.82+) and for releases older than 0.77 (16 KB page sizes).
- **Dependencies:** installed (from the lockfile) vs latest; New Architecture support and maintenance status from
  React Native Directory; deprecated packages and known replacements. Tooling pinned by the React Native template is
  compared with the template's version instead of npm latest.
- **Native settings vs the React Native template** for your current and the target version: targetSdk, compileSdk,
  minSdk, build tools, NDK, Kotlin, Gradle, New Architecture, Hermes and the iOS deployment target. Google Play's
  target API level (36) is checked.
- **16 KB page-size scan** of a built APK or AAB (`--apk`): ELF segment alignment and zip alignment of every 64-bit
  native library, each mapped to the npm package behind it. Matches Google's `zipalign -c -P 16` and `llvm-readelf`.
- **16 KB summary in plain words:** a verdict, libraries counted once (not per ABI), failures split into "one build
  fix for all" (zip alignment) and "upgrade these packages" (4 KB ELF), grouped per package, plus Google's own check.
- **patch-package and pnpm patches** that need re-checking.
- **Lockfiles:** npm (v1–v3), Yarn classic and Berry, pnpm (v5–v9); monorepo workspaces.
- **Reports:** terminal, HTML, Markdown and JSON; findings ranked blocker, warning, info and grouped per package.
  Every value says where its data came from; missing data is reported, never silently skipped.
- **Offline mode** with a local cache (`--offline`, `--cache-dir`). Colours follow `FORCE_COLOR` / `NO_COLOR`.
- **GitHub Action:** job summary, pull request comment, fail on blockers.
- Exit codes: 0 no blockers, 1 blockers, 2 the tool could not run (or, with `--ci`, a registry was unreachable).
