# Records docs/demo.gif from the example projects (offline, frozen registry data). Run from the repo root:
#   npm run demo
Output docs/demo.gif
Set FontSize 14
Set Width 1560
Set Height 760
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

# Setup, not recorded: copy two examples to /tmp so no local paths appear on screen.
Hide
Type "rm -rf /tmp/my-rn-app /tmp/scanner-app && cp -r examples/10-everything-broken /tmp/my-rn-app"
Enter
Type "mkdir /tmp/scanner-app && cp examples/09-16kb-apk/package*.json /tmp/scanner-app/ && cp examples/09-16kb-apk/bad.apk /tmp/scanner-app/app-release.apk"
Enter
# FORCE_COLOR keeps colours when the output is piped into head/grep.
Type "export RUD=$PWD FORCE_COLOR=1"
Enter
Type `alias rn-upgrade-doctor='node "$RUD/dist/cli.js" --offline --cache-dir "$RUD/examples/registry-snapshot"'`
Enter
Type "cd /tmp && clear"
Enter
Show

# Scene 1: an old app; blockers first, findings grouped per package.
Type "rn-upgrade-doctor my-rn-app | head -n 34"
Sleep 500ms
Enter
Sleep 7s

Hide
Type "clear"
Enter
Show

# Scene 2: the 16 KB page-size scan of a release APK, mapped to npm packages.
Type `rn-upgrade-doctor scanner-app --apk scanner-app/app-release.apk | grep -A 15 "16 KB page size"`
Sleep 500ms
Enter
Sleep 8s
