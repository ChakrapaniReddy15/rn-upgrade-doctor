# RN Upgrade Doctor — guide for Claude Code

Read this file first, then `docs/PLAN.md` (full plan) and `docs/TASKS.md` (current tasks).

## What we are building
A Node.js + TypeScript CLI, `npx rn-upgrade-doctor`, that a React Native team runs inside its project to get one
ranked report of what will break on upgrade and what to fix first:
- React Native version gap and a link to the official upgrade-helper diff
- every dependency: installed vs latest, New Architecture support, maintenance status
- Android config (targetSdk, compileSdk, minSdk, newArchEnabled, hermesEnabled) and iOS config (Podfile, min iOS)
- **16 KB page-size scan** of a built APK/AAB (`--apk path`), mapping each failing `.so` to the npm package behind it
- patch-package patches that need re-checking
- output: coloured terminal summary, HTML / Markdown / JSON report, GitHub Action for pull requests

## Hard rules
- **Clean-room:** everything is written fresh from public docs. Never copy code, configs, file names or details from
  any employer's or client's projects, and never name them in code, docs, commits, tests or fixtures.
- Fixtures are fresh sample apps created from public templates only.
- Never commit secrets or tokens. GitHub/npm tokens come from env vars (`GITHUB_TOKEN`) only.
- Suggest before large changes; keep changes small and reviewed. The owner pushes to GitHub himself.

## Tech and conventions
- Node.js 20+, TypeScript strict, ESM (`"type": "module"`), output to `dist/`.
- CLI: commander. Terminal: picocolors + cli-table3. Zip: yauzl. Tests: Vitest. Dev runner: tsx.
- Pure functions for checks: each check takes a `ProjectContext` and returns `Finding[]`
  (`{ id, severity: 'blocker' | 'warning' | 'info', title, detail, package?, fix?, source }`).
- Network calls (npm registry, React Native Directory, GitHub) go through `src/registry/` with a local cache
  (`~/.cache/rn-upgrade-doctor`) and graceful offline fallback. Always label the data source of a value.
- Rules/advice live in versioned data files under `src/rules/`, not scattered in code.
- Exit codes: 0 = no blockers, 1 = blockers found (for CI), 2 = tool error.

## Layout
```
src/cli.ts            command + flags
src/index.ts          runScan(options) -> Report (library entry)
src/project/          read package.json, lockfiles (npm/yarn/pnpm), detect RN version, patches/
src/registry/         npm registry, React Native Directory, GitHub clients + cache
src/android/          Gradle / gradle.properties parsing
src/ios/              Podfile / Podfile.lock parsing
src/apk/              unzip APK/AAB, ELF header parser, 16 KB alignment check, .so -> package mapping
src/rules/            known libraries table, version rules, advice text, semver helpers
src/checks/           pure checks (ProjectContext -> Finding[]) and ranking
src/report/           terminal, HTML, Markdown, JSON renderers
action.yml            composite GitHub Action (example workflow in docs/examples/)
examples/             text-only scenario projects + registry-snapshot/ (offline data); see examples/README.md
scripts/              example APK generator and example runner (npm run examples)
test/                 Vitest specs; fixtures/ holds sample projects and APKs (not committed if large)
docs/                 PLAN.md (full plan), TASKS.md (checklist)
```

## Commands
- `npm install` · `npm run dev -- scan --cwd <project>` · `npm run build` · `npm test` · `npm run lint` (type-checks src and test)

## Status
- Weeks 1–3 feature code done: project/lockfiles, registry + cache, Android/iOS/patches, 16 KB APK/AAB scan, checks,
  renderers, GitHub Action. Not yet checked against real buildable apps or real release APKs.
- Examples in examples/ cover every finding id (test/examples.test.ts guards this).
- Open: real buildable fixture apps, real-APK validation, GitHub client (archived repos), README GIF, npm publish. See `docs/TASKS.md`.
