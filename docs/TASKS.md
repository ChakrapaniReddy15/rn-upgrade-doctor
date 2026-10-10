# Tasks

## Week 0 — setup
- [x] Folder, plan docs, CLAUDE.md, package.json, tsconfig, folder skeleton, git init
- [x] Check the npm name `rn-upgrade-doctor` is free (else pick another and rename everywhere)
- [x] Create empty public GitHub repo and push (owner does the push)
- [x] `npm install`; `npm run build` and `npm test` pass on the skeleton
- [ ] Create 4–5 fresh sample RN apps (public templates) at different versions under fixtures/ (gitignored) and build APKs

## Week 1 — version gap + dependency report
- [x] `src/project`: read package.json, detect RN version, detect package manager
- [x] Lockfile parsers: package-lock.json, yarn.lock, pnpm-lock.yaml -> installed versions
- [x] `src/registry`: npm registry client (latest version, last publish) with cache
- [x] React Native Directory client (New Architecture flag, unmaintained) — verify the current API first
- [x] Findings model + ranking; terminal summary with cli-table3
- [x] Tests for each parser with small inline fixtures

## Week 2 — 16 KB scan
- [x] `src/apk`: list .so files in APK/AAB (lib/<abi>/ and base/lib/<abi>/)
- [x] ELF64 parser: read program headers, check PT_LOAD p_align >= 16384
- [x] APK: check uncompressed .so entries are 16 KB aligned in the zip
- [x] Map .so -> npm package (node_modules search + known table)

## Week 3 — checks, reports, CI, release
- [x] Android Gradle + iOS Podfile checks; patch-package detection
- [x] HTML, Markdown, JSON renderers
- [x] GitHub Action (composite) + example workflow
- [ ] README with GIF; publish v0.1

## Week 4 — feedback
- [ ] Fix issues, v0.2
