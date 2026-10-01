#!/bin/bash
# Installs or updates the Mac Cleaner menu bar app from the latest GitHub release.
#
#   curl -fsSL https://guhcostan.github.io/mac-cleaner-cli/install.sh | bash
#
# The app is not signed with an Apple Developer ID, so a .dmg downloaded with a browser
# triggers Gatekeeper's "Apple could not verify…" prompt. Browsers tag downloads with the
# com.apple.quarantine attribute; curl does not, so the app installed here opens normally.
# The download is still checked against the SHA-256 digest GitHub publishes for it.
#
# Environment:
#   MAC_CLEANER_INSTALL_DIR  install into this folder instead of /Applications
#   MAC_CLEANER_NO_OPEN=1    do not open the app afterwards
#   MAC_CLEANER_GITHUB_TOKEN optional, raises the GitHub API rate limit (used by CI)

set -euo pipefail

REPO="guhcostan/mac-cleaner-cli"
APP="Mac Cleaner.app"
PROCESS_NAME="Mac Cleaner"
BUNDLE_ID="io.github.guhcostan.maccleaner"

say() { printf '%s\n' "$*"; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

main() {
  [ "$(uname -s)" = "Darwin" ] || fail "Mac Cleaner only runs on macOS."
  for tool in curl plutil shasum ditto; do
    command -v "$tool" >/dev/null 2>&1 || fail "'$tool' is required but was not found."
  done

  # sysctl reports Apple Silicon even when the shell runs under Rosetta.
  local arch label
  if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || true)" = "1" ]; then
    arch="arm64"; label="Apple Silicon"
  else
    arch="x64"; label="Intel"
  fi

  WORK="$(mktemp -d "${TMPDIR:-/tmp}/mac-cleaner-app.XXXXXX")"
  trap 'rm -rf "$WORK"' EXIT

  # MAC_CLEANER_GITHUB_TOKEN is optional; it only lifts the API rate limit (60 requests/hour per IP).
  local auth=()
  [ -n "${MAC_CLEANER_GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $MAC_CLEANER_GITHUB_TOKEN")
  curl -fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: mac-cleaner-install" ${auth[@]+"${auth[@]}"} \
    "https://api.github.com/repos/$REPO/releases/latest" -o "$WORK/release.json" \
    || fail "Could not read the latest release from GitHub."

  json() { plutil -extract "$1" raw -o - "$WORK/release.json" 2>/dev/null; }

  local tag
  tag="$(json tag_name)" || fail "Unexpected response from the GitHub releases API."

  # Find the zip for this architecture, e.g. Mac-Cleaner-1.4.0-arm64-mac.zip.
  local i=0 name="" url="" digest="" found=""
  while name="$(json "assets.$i.name")"; do
    if [[ "$name" =~ ^Mac-Cleaner-[0-9][0-9A-Za-z.+-]*-${arch}-mac\.zip$ ]]; then
      url="$(json "assets.$i.browser_download_url")" || true
      digest="$(json "assets.$i.digest")" || true
      found="yes"
      break
    fi
    i=$((i + 1))
    [ "$i" -lt 200 ] || break
  done
  [ -n "$found" ] || fail "Release $tag has no Mac Cleaner app for $arch."
  [[ "$url" == https://github.com/* ]] || fail "Unexpected download URL for $name."
  [[ "$digest" =~ ^sha256:[0-9a-fA-F]{64}$ ]] \
    || fail "GitHub did not publish a SHA-256 digest for $name, so the download cannot be verified."
  local expected
  expected="$(printf '%s' "${digest#sha256:}" | tr 'A-F' 'a-f')"

  say "Downloading Mac Cleaner $tag ($label)…"
  curl -fL --progress-bar -H "User-Agent: mac-cleaner-install" "$url" -o "$WORK/app.zip" \
    || fail "Download failed."

  local actual
  actual="$(shasum -a 256 "$WORK/app.zip" | awk '{print $1}')"
  [ "$actual" = "$expected" ] \
    || fail "Checksum mismatch for $name: expected $expected, got $actual. Nothing was installed."

  # ditto keeps the bundle's symlinks, permissions and code signature intact.
  ditto -x -k "$WORK/app.zip" "$WORK/extracted"
  [ -d "$WORK/extracted/$APP" ] || fail "$name does not contain $APP."

  local dir
  if [ -n "${MAC_CLEANER_INSTALL_DIR:-}" ]; then
    dir="$MAC_CLEANER_INSTALL_DIR"
    mkdir -p "$dir"
  elif [ -d /Applications ] && [ -w /Applications ]; then
    dir="/Applications"
  else
    # Standard accounts can't write to /Applications.
    dir="$HOME/Applications"
    mkdir -p "$dir"
  fi

  # Copy next to the destination first so a failed copy never leaves the user without an
  # app, then swap it in with a rename on the same volume.
  local staged="$dir/.$APP.installing"
  rm -rf "$staged"
  ditto "$WORK/extracted/$APP" "$staged"

  if pgrep -x "$PROCESS_NAME" >/dev/null 2>&1; then
    say "Quitting the running Mac Cleaner…"
    osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  fi
  rm -rf "$dir/$APP"
  mv "$staged" "$dir/$APP"
  xattr -dr com.apple.quarantine "$dir/$APP" 2>/dev/null || true

  say "✓ Mac Cleaner $tag installed in $dir"

  if [ "${MAC_CLEANER_NO_OPEN:-}" != "1" ]; then
    open "$dir/$APP"
    say "It lives in the menu bar (top right). Grant it Full Disk Access when it asks."
  fi
}

# Everything runs from here, so a partially downloaded script never executes halfway.
main "$@"
