# mac-cleaner-cli interactive demo
# Shows: launch → scan → category selection → summary → cancel

Require npx

Output demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 900
Set Height 540
Set Theme Dracula
Set Framerate 15
Set PlaybackSpeed 1.0
Set TypingSpeed 60ms
Set WindowBar Colorful
Set WindowBarSize 40
Set BorderRadius 10
Set Margin 20
Set MarginFill "#282a36"
Set Padding 10

# Launch
Type "npx mac-cleaner-cli"
Enter
Sleep 500ms

# Wait for scan to finish and interactive menu to appear
Wait+Screen@60s /Select categories/

# Select first two categories
Space
Sleep 600ms
Down
Space
Sleep 600ms

# Confirm selection
Enter
Sleep 2s

# Decline deletion (safe demo)
Type "n"
Enter
Sleep 4s
