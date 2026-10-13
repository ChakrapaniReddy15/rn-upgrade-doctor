# rn-upgrade-doctor

> Work in progress — not published to npm yet. Run it from source (see [Development](#development)).

One command to see what will break when you upgrade a React Native app, and what to fix first.

```bash
npx rn-upgrade-doctor                                   # scan the project in the current folder
npx rn-upgrade-doctor ./apps/mobile                     # scan another folder (monorepo apps work too)
npx rn-upgrade-doctor --apk app-release.apk             # also run the 16 KB page-size scan
npx rn-upgrade-doctor --format terminal,html --out reports
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
| Android | Your targetSdk, compileSdk, minSdk, build tools, NDK, Kotlin, Gradle, `newArchEnabled`, `hermesEnabled` side by side with the official React Native template for your version and the target version; targetSdk vs Google Play minimum | `android/*.gradle`, `gradle.properties`, [React Native template](https://github.com/react-native-community/rn-diff-purge) |
| iOS | Deployment target vs the template's minimum, `RCT_NEW_ARCH_ENABLED`, Podfile.lock in sync | `ios/Podfile`, `ios/Podfile.lock`, React Native template |
| 16 KB page size | ELF `PT_LOAD` alignment of every 64-bit `.so`, 16 KB zip alignment of uncompressed `.so` in APKs, each library mapped to its npm package | `--apk` file, `node_modules` |
| Patches | patch-package and pnpm patches that need re-checking, or no longer match the installed version | `patches/`, `package.json` |

Every finding says where its data came from. Findings are ranked: **blockers** (will break the build or the Play Store release), **warnings** (fix during the upgrade), **info**.

## Options

| Option | Default | |
|---|---|---|
| `[path]` or `--cwd <path>` | current folder | React Native project folder |
| `--apk <path>` | | APK or AAB for the 16 KB scan, relative to the current folder. Run `npm install` in the project first so libraries can be mapped to packages. |
| `--format <list>` | `terminal` | Any of `terminal`, `html`, `md`, `json` |
| `--out <dir>` | project folder | Where `rn-upgrade-doctor-report.{html,md,json}` are written |
| `--ci` | off | No colours; exit `2` if npm or React Native Directory cannot be reached, so a network failure never passes as clean |
| `--offline` | off | No network; use cached registry data only |
| `--cache-dir <dir>` | `~/.cache/rn-upgrade-doctor` | Registry cache folder (also `RN_UPGRADE_DOCTOR_CACHE_DIR`) |

| `-v, --version` | | Print the version |

Exit codes: `0` no blockers, `1` blockers found, `2` the tool could not run (for example, not a React Native project) or, with `--ci`, a registry was unreachable.

**Monorepos:** point it at the app folder (`apps/mobile`). When the app has no lockfile of its own, the tool looks in parent
folders for the workspace root (a lockfile plus `workspaces` in `package.json`, or `pnpm-workspace.yaml`), without leaving
the git repository. `patches/` and hoisted `node_modules` are read from there too.

**Missing data is reported**, never silently skipped: no lockfile, or registry data that could not be fetched, becomes a
warning in the report.

See [docs/COMMANDS.md](docs/COMMANDS.md) for every command with an explanation.

Registry responses are cached in `~/.cache/rn-upgrade-doctor` (npm: 12 h, React Native Directory: 24 h, React Native
templates: permanently, since a release's template never changes). Use `--cache-dir` or `RN_UPGRADE_DOCTOR_CACHE_DIR` to move it.

**Native settings vs the React Native template:** the "latest" value for an Android or iOS setting is what a new app
created on that React Native version uses. The tool reads it from the same public data the official upgrade helper uses
(`react-native-community/rn-diff-purge`) and shows your value next to the template of your current version and of the
target version. Statuses: *below the minimum* (minSdk, iOS target, Play's targetSdk), *raised by the upgrade*,
*behind your RN version* (drift you already have), *newer* (fine). Template values other than the minimums are
recommendations, not hard rules.

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
npm run dev -- ../my-rn-app         # run from source (no build needed)
npm run examples                    # run every example scenario
npm test                            # Vitest
npm run lint                        # type-check src and tests
npm run build                       # compile to dist/
```

MIT © Sunkesula Chakrapani Reddy
