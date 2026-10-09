# rn-upgrade-doctor

> Work in progress — not published yet.

One command to see what will break when you upgrade a React Native app, and what to fix first.

```bash
npx rn-upgrade-doctor            # scan the project in the current folder
npx rn-upgrade-doctor --apk app-release.aab   # also run the 16 KB page-size scan
```

It checks:
- React Native version gap, with a link to the official upgrade-helper diff
- every dependency: installed vs latest, New Architecture support, maintenance status
- Android (targetSdk, compileSdk, minSdk, New Architecture, Hermes) and iOS (Podfile) config
- 16 KB page-size support of native libraries in your built APK/AAB, mapped to the npm package behind each one
- patch-package patches that need re-checking

Outputs a terminal summary plus HTML, Markdown and JSON reports, and can run as a GitHub Action on pull requests.

MIT © Sunkesula Chakrapani Reddy
