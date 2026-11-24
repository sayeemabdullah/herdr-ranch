#!/usr/bin/env bash
# Installs the Herdr Ranch layout into a Herdr desktop home and switches to it.
# Anything it would replace is first moved to backups/herdr-ranch-<time>/.
# RANCH_NO_SWITCH=1 installs without switching the open window's layout.
#
#   ./install.sh               the layout, themes and mods
#   ./install.sh --cli         also the `ranch` command (VS Code in the terminal) in ~/.local/bin
#   ./install.sh --cli-only    only the `ranch` command
# RANCH_BIN_DIR sets where the command goes (default ~/.local/bin).
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

CLI=0; CLI_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --cli) CLI=1 ;;
    --cli-only) CLI=1; CLI_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "$REPO/install.sh" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "unknown option $arg (try --help)" ;;
  esac
done

# Copies bin/ranch next to your other commands. It never replaces a different command called ranch.
install_cli() {
  local dir="${RANCH_BIN_DIR:-$HOME/.local/bin}" target
  target="$dir/ranch"
  mkdir -p "$dir"
  if [ -e "$target" ] && ! grep -q "^# ranch: open VS Code in your terminal" "$target" 2>/dev/null; then
    fail "$target already exists and is not this command; not replacing it. Move it, or set RANCH_BIN_DIR."
  fi
  cp "$REPO/bin/ranch" "$target"
  chmod +x "$target"
  echo "Installed the ranch command: $target"
  case ":$PATH:" in *":$dir:"*) ;; *) echo "  $dir is not on your PATH yet; add it to use \`ranch\`." ;; esac
  command -v tode >/dev/null 2>&1 || echo "  It needs terminal-code (the tode command): curl -fsSL https://tode.sh/install | bash"
}

if [ "$CLI_ONLY" = 1 ]; then install_cli; exit 0; fi

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

if command -v herdr-app >/dev/null; then
  for mod in "${MODS[@]}"; do
    (cd "$HERDR_HOME" && herdr-app check "mods/$mod") || fail "mods/$mod did not load; see the message above."
  done
  if [ -z "${RANCH_NO_SWITCH:-}" ]; then
    herdr-app do layout.switch "{\"name\":\"$LAYOUT\"}" >/dev/null \
      || echo "Herdr isn't running: pick Herdr Ranch with ctrl-shift-l when it opens."
  fi
fi

if [ "$CLI" = 1 ]; then install_cli; fi

if [ "$(uname)" = "Darwin" ] && ! command -v terminal-notifier >/dev/null; then
  cat <<'TXT'

Optional: system banners with the animal's picture when Herdr is in the background.
  brew install terminal-notifier
  open "$(brew --prefix terminal-notifier)/terminal-notifier.app"   # allow notifications once
TXT
fi

echo "Done. ctrl-shift-l switches layouts."
