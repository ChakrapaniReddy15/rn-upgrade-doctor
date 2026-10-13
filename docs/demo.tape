# Records docs/demo.gif. Run from the repo root:  npm run build && vhs docs/demo.tape
Output docs/demo.gif
Set FontSize 15
Set Width 1200
Set Height 760
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "rm -rf /tmp/my-rn-app && cp -r examples/10-everything-broken /tmp/my-rn-app"
Enter
Type "alias rn-upgrade-doctor='node $PWD/dist/cli.js --offline --cache-dir $PWD/examples/registry-snapshot'"
Enter
Type "cd /tmp && clear"
Enter
Show

Type "rn-upgrade-doctor my-rn-app"
Sleep 500ms
Enter
Sleep 6s
