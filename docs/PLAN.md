# RN Upgrade Doctor — full plan

## 1. Problem
React Native upgrades are slow and risky because nobody knows upfront which libraries will break. Teams find out late,
from build errors, crashes or a Play Store rejection. Since 1 Nov 2025 Google Play blocks updates for apps targeting
Android 15+ that don't support 16 KB memory pages, and the error doesn't say which npm package caused it.

**Who it's for:** React Native developers, tech leads planning an upgrade, agencies maintaining many apps.

## 2. Solution
One command run inside any React Native project: `npx rn-upgrade-doctor [--apk app.aab]`. It produces one prioritised
report (blockers first, then warnings) and can run in CI on every pull request.

## 3. Competition and our difference
| Existing | What it does | Gap we fill |
| --- | --- | --- |
| React Native Package Checker (web) | Drop package.json, see New Architecture support | No CLI/CI, no built-app scan, no 16 KB check |
| expo doctor | Expo project health | Expo-focused; no 16 KB scan of the built app |
| Official upgrade helper | File diff between RN versions | Doesn't look at your dependencies |
| Google's 16 KB check script | .so alignment in an APK | Doesn't map failures to npm packages or fixes |

Difference: one command, CI-ready, scans the built APK/AAB and names the npm package behind each failing native
library, with advice from real major upgrades.

## 4. How it works (flow)
```mermaid
flowchart LR
  A[Run: npx rn-upgrade-doctor] --> B[Read project: package.json, lockfile, Gradle, Podfile]
  B --> C[Fetch package data: npm, RN Directory, GitHub]
  C --> E[Score and rank: blockers, warnings]
  B -. --apk given .-> D1[Scan built app: unzip, check .so alignment]
  D1 --> D2[Map .so to npm package]
  D2 --> E
  E --> F[Report: terminal, HTML, Markdown, JSON]
  F --> G[CI: comment on PR, fail on blockers]
```

## 5. Checks (MVP)
| Area | Check | Severity |
| --- | --- | --- |
| RN version | Installed vs latest; minor versions behind; upgrade-helper link | warning (blocker if very old) |
| Dependencies | Installed vs latest; last publish date; archived repo | warning |
| New Architecture | Library support from React Native Directory data | blocker if unsupported and newArch enabled/required |
| Android | targetSdk / compileSdk / minSdk vs Play requirements; newArchEnabled; hermesEnabled | blocker/warning |
| 16 KB | Each arm64-v8a / x86_64 `.so`: ELF PT_LOAD p_align >= 16384; uncompressed .so zip alignment | blocker |
| iOS | Podfile platform :ios version; Podfile.lock pod versions | warning |
| Patches | `patches/*.patch` (patch-package) on packages being upgraded | warning |

## 6. Tech stack
| Part | Choice |
| --- | --- |
| Runtime | Node.js 20+, TypeScript (strict, ESM) |
| CLI | commander |
| Terminal | picocolors, cli-table3 |
| Lockfiles | own parsers for package-lock.json, yarn.lock (v1 + berry), pnpm-lock.yaml (yaml) |
| Data | npm registry API; React Native Directory data (verify current API); GitHub REST API (optional token) |
| 16 KB | yauzl to read the zip; small ELF64 program-header parser |
| Mapping | search node_modules for each .so name + CMake target names; known-library table in src/rules |
| Reports | HTML (single file, inline CSS), Markdown, JSON |
| CI | GitHub Action (composite) |
| Tests | Vitest, fixture projects, sample APKs |

## 7. Report outputs
- **Terminal:** header (RN version gap), BLOCKERS (n), WARNINGS (n), OK count, path to HTML report.
- **HTML:** summary cards (blockers / warnings / OK), table (package, issue, fix, source), upgrade path and helper link.
- **JSON:** `{ meta, summary, findings[] }` — stable schema for CI and other tools.
- **Markdown:** same as HTML, for PR comments.

## 8. Features
MVP: version gap, dependency table, Android/iOS checks, 16 KB scan + mapping, patch detection, 3 report formats,
GitHub Action.
Later: Expo support, monorepos, "fix" mode with suggested version bumps, VS Code extension, history across runs.

## 9. What's required
Accounts: GitHub, npm (free). Tools: Node 20+, Android Studio + SDK (to build test APKs), Xcode (optional).
Test material: 4–5 fresh sample RN apps at different versions (e.g. 0.72, 0.76, 0.80, latest) + their APKs/AABs.
Device: optional Android 15 emulator with a 16 KB system image. Cost: ₹0.

## 10. Challenges and mitigations
| Challenge | Mitigation |
| --- | --- |
| .so names don't match package names | Search node_modules build files and CMake targets; known-library table; show "unknown" honestly |
| RN Directory data missing/stale | Fall back to npm publish dates + GitHub archived flag; label sources |
| Many project shapes | MVP: bare React Native only; say so in README |
| API rate limits | Local cache; optional GITHUB_TOKEN |
| Advice goes stale | Rules in one versioned file; update per RN release |
| Low adoption | Real story + demo; answer issues fast |

