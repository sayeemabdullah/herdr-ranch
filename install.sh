#!/usr/bin/env bash
# Installs the Herdr Ranch layout into a Herdr desktop home and switches to it.
# Anything it would replace is first moved to backups/herdr-ranch-<time>/.
# RANCH_NO_SWITCH=1 installs without switching the open window's layout.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERDR_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
STAMP="$(date +%Y%m%d-%H%M%S)"
# Outside mods/ and layouts/: a backed-up mod folder left in mods/ would load as a mod of its own.
BACKUP="$HERDR_HOME/backups/herdr-ranch-$STAMP"
LAYOUT="Herdr-Ranch"
MODS=(flock flock-toast flock-status meadows ranch-chrome ranch-tabs ranch-pane)
THEMES=(ranch-meadow ranch-dusk)

fail() { echo "install.sh: $*" >&2; exit 1; }

[ -d "$HERDR_HOME" ] || fail "no Herdr home at $HERDR_HOME. Open Herdr once, or set HERDR_APP_HOME."

# $1: a path relative to the Herdr home.
keep_aside() {
  if [ -e "$HERDR_HOME/$1" ]; then
    mkdir -p "$(dirname "$BACKUP/$1")"
    mv "$HERDR_HOME/$1" "$BACKUP/$1"
    echo "  moved the old $1 to backups/herdr-ranch-$STAMP/"
  fi
}

echo "Installing into $HERDR_HOME"
mkdir -p "$HERDR_HOME/layouts" "$HERDR_HOME/themes" "$HERDR_HOME/mods"

for mod in "${MODS[@]}"; do
  keep_aside "mods/$mod"
  cp -R "$REPO/mods/$mod" "$HERDR_HOME/mods/$mod"
done
for theme in "${THEMES[@]}"; do
  keep_aside "themes/$theme.json"
  cp "$REPO/themes/$theme.json" "$HERDR_HOME/themes/"
done
for file in "$LAYOUT.json" "$LAYOUT.png"; do
  keep_aside "layouts/$file"
  cp "$REPO/layouts/$file" "$HERDR_HOME/layouts/"
done

[ -f "$REPO/VERSION" ] && cp "$REPO/VERSION" "$HERDR_HOME/herdr-ranch.version"

if command -v herdr-app >/dev/null; then
  for mod in "${MODS[@]}"; do
    (cd "$HERDR_HOME" && herdr-app check "mods/$mod") || fail "mods/$mod did not load; see the message above."
  done
  if [ -z "${RANCH_NO_SWITCH:-}" ]; then
    herdr-app do layout.switch "{\"name\":\"$LAYOUT\"}" >/dev/null \
      || echo "Herdr isn't running: pick Herdr Ranch with ctrl-shift-l when it opens."
  fi
fi

if [ "$(uname)" = "Darwin" ] && ! command -v terminal-notifier >/dev/null; then
  cat <<'TXT'

Optional: system banners with the animal's picture when Herdr is in the background.
  brew install terminal-notifier
  open "$(brew --prefix terminal-notifier)/terminal-notifier.app"   # allow notifications once
TXT
fi

echo "Done. ctrl-shift-l switches layouts."
