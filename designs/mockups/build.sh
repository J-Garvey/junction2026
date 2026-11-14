#!/usr/bin/env bash
# Builds self-contained HTML from src/:
#   index.html                 all screens, desktop + mobile
#   screens/<nn>-<key>.html    one screen each
#   ../system/index.html       Tukku design system spec
set -euo pipefail
cd "$(dirname "$0")"
tmp=$(mktemp -d)
cat src/ui.jsx src/screens.jsx > "$tmp/screens.jsx"
cat src/ui.jsx src/screens.jsx src/system.jsx > "$tmp/system.jsx"
npx -y esbuild@0.24.0 "$tmp/screens.jsx" --jsx=transform --minify --outfile="$tmp/screens.js" --log-level=warning
npx -y esbuild@0.24.0 "$tmp/system.jsx" --jsx=transform --minify --outfile="$tmp/system.js" --log-level=warning
mkdir -p screens ../system
page() { # $1 out, $2 js, $3 window vars, $4 title, $5 card marker
  {
    [ -n "$5" ] && echo "<!-- @dsCard group=\"$5\" -->"
    cat <<EOF
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$4</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=Source+Code+Pro:wght@400;500;600&display=swap" rel="stylesheet">
<style>
EOF
    cat src/styles.css
    echo "</style></head><body><div id=\"root\"></div>"
    echo '<script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>'
    echo '<script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>'
    echo "<script>$3</script><script>"
    cat "$2"
    echo "</script></body></html>"
  } > "$1"
}
page index.html "$tmp/screens.js" "window.SCREEN=null;" "Banquet Copilot screens" ""
n=1
for k in home thread dashboard approval receipt change audit policy agents; do
  page "screens/0${n}-${k}.html" "$tmp/screens.js" "window.SCREEN=\"$k\";" "Banquet Copilot: $k" "Screens"
  n=$((n + 1))
done
page ../system/index.html "$tmp/system.js" "window.PAGE=\"system\";" "Aimo Copilot design system" "Design system"
rm -rf "$tmp"
echo built
