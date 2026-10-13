# Roadmap

## Setup
- [x] Repository, plan docs, CLAUDE.md, package.json, tsconfig, folder skeleton
- [x] npm name `rn-upgrade-doctor` is free
- [x] Public GitHub repository and CI (lint, test, build)
- [x] Example scenarios: text-only projects in `examples/` covering every finding id (offline, registry snapshot)
- [ ] 1–2 real buildable RN apps from the public template under `fixtures/` (git-ignored), with release APKs, to compare
      the 16 KB scan with Google's own check

## Version gap and dependency report
- [x] `src/project`: read package.json, detect RN version, detect package manager
- [x] Lockfile parsers: package-lock.json, yarn.lock (classic + Berry), pnpm-lock.yaml -> installed versions
- [x] Monorepos: find the workspace root (npm/yarn workspaces, pnpm-workspace.yaml) for lockfile, patches, node_modules
- [x] `src/registry`: npm registry client with cache and offline mode
- [x] React Native Directory client (New Architecture support, unmaintained)
- [x] Findings model + ranking; missing-data findings
- [x] Tests for each parser with small inline fixtures

## 16 KB page-size scan
- [x] `src/apk`: list .so files in APK/AAB (lib/<abi>/ and <module>/lib/<abi>/)
- [x] ELF parser: read program headers, check PT_LOAD p_align >= 16384
- [x] APK: check uncompressed .so entries are 16 KB aligned in the zip
- [x] Map .so -> npm package (node_modules search + known table)

## Checks, reports, CI
- [x] Android Gradle + iOS Podfile checks; patch-package detection
- [x] Native settings vs the React Native template for the current and target version (rn-diff-purge), cached permanently
- [x] Terminal, HTML, Markdown, JSON renderers, including Android/iOS config
- [x] GitHub Action (composite) + example workflow

## Release
- [ ] Verify the Play targetSdk minimum in `src/rules/reactNative.ts` (platform minimums now come from the template)
- [ ] README with a demo GIF
- [ ] Publish v0.1 to npm; tag `v0.1.0`

## Later
- [ ] Ranking within a severity (native runtime libraries first; deprecated dev dependencies as info)
- [ ] One finding per package listing all its problems
- [ ] More known replacements in `src/rules/libraries.ts`
- [ ] `--to <version>` to check against a chosen target instead of the latest React Native
- [ ] GitHub client: archived repositories, last commit
- [ ] Expo projects
