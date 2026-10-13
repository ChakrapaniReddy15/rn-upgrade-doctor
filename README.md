# rn-upgrade-doctor

> Work in progress — not published to npm yet. Run it from source (see [Development](#development)).

One command to see what will break when you upgrade a React Native app, and what to fix first.

```bash
npx rn-upgrade-doctor                                   # scan the project in the current folder
npx rn-upgrade-doctor --apk app-release.apk             # also run the 16 KB page-size scan
npx rn-upgrade-doctor --format terminal,md --out reports
```

## Try it

The [`examples/`](examples) folder has small text-only projects, one per scenario (healthy app, old React Native,
New Architecture blockers, bad Gradle config, old Podfile, patches, 16 KB APK scan, ...). They run offline:

```bash
npm install
npm run examples                                       # every scenario, terminal output
npx tsx src/cli.ts examples/10-everything-broken --offline --cache-dir examples/registry-snapshot
```

## What it checks

| Area | Checks | Data source |
|---|---|---|
| React Native | Version gap to the latest release, link to the [upgrade helper](https://react-native-community.github.io/upgrade-helper/) diff, New Architecture-only releases (0.82+), 16 KB support (0.77+) | lockfile, npm registry, rules |
| Dependencies | Installed vs latest, New Architecture support, unmaintained / deprecated packages, known replacements | lockfile, npm registry, [React Native Directory](https://reactnative.directory) |
| Android | targetSdk vs Google Play minimum, compileSdk, minSdk vs React Native minimum, `newArchEnabled`, `hermesEnabled` | `android/*.gradle`, `gradle.properties` |
| iOS | Deployment target vs React Native minimum, `RCT_NEW_ARCH_ENABLED`, Podfile.lock in sync | `ios/Podfile`, `ios/Podfile.lock` |
| 16 KB page size | ELF `PT_LOAD` alignment of every 64-bit `.so`, 16 KB zip alignment of uncompressed `.so` in APKs, each library mapped to its npm package | `--apk` file, `node_modules` |
| Patches | patch-package and pnpm patches that need re-checking, or no longer match the installed version | `patches/`, `package.json` |

Every finding says where its data came from. Findings are ranked: **blockers** (will break the build or the Play Store release), **warnings** (fix during the upgrade), **info**.

## Options

| Option | Default | |
|---|---|---|
| `[path]` or `--cwd <path>` | current folder | React Native project folder |
| `--apk <path>` | | APK or AAB for the 16 KB scan, relative to the current folder. Run `npm install` in the project first so libraries can be mapped to packages. |
| `--format <list>` | `terminal,html` | Any of `terminal`, `html`, `md`, `json` |
| `--out <dir>` | project folder | Where `rn-upgrade-doctor-report.{html,md,json}` are written |
| `--ci` | off | No colours; for CI logs |
| `--offline` | off | No network; use cached registry data only |
| `--cache-dir <dir>` | `~/.cache/rn-upgrade-doctor` | Registry cache folder (also `RN_UPGRADE_DOCTOR_CACHE_DIR`) |

Exit codes: `0` no blockers, `1` blockers found, `2` the tool failed (for example, not a React Native project).

Registry responses are cached in `~/.cache/rn-upgrade-doctor` (npm: 12 h, React Native Directory: 24 h). Use `--cache-dir` or `RN_UPGRADE_DOCTOR_CACHE_DIR` to move it.

## GitHub Action

Adds the Markdown report to the job summary, can comment on the pull request, and fails the job on blockers.
See [docs/examples/rn-upgrade-doctor.yml](docs/examples/rn-upgrade-doctor.yml).

```yaml
- uses: actions/checkout@v4
- uses: ChakrapaniReddy15/rn-upgrade-doctor@main
  with:
    comment: true            # needs permissions: pull-requests: write
    fail-on-blockers: true
    # apk: android/app/build/outputs/apk/release/app-release.apk
```

## Library use

```ts
import { runScan, renderReport } from 'rn-upgrade-doctor';

const report = await runScan({ cwd: '.', format: ['json'], ci: true, offline: false });
console.log(report.summary, renderReport(report, 'md'));
```

## Development

```bash
npm install
npm run dev -- ../my-rn-app         # run from source
npm run examples                    # run every example scenario
npm test                            # Vitest
npm run lint                        # type-check src and tests
npm run build                       # compile to dist/
```

MIT © Sunkesula Chakrapani Reddy
