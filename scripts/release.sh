#!/usr/bin/env bash
set -euo pipefail

REPO="MartinGonzalez/tango-app"

usage() {
  echo "Usage: ./scripts/release.sh <rc|patch|minor|major>"
  echo ""
  echo "  rc     Create next release candidate (e.g. v0.0.1-rc1 → v0.0.1-rc2)"
  echo "  patch  Create stable patch release   (e.g. v0.0.1 → v0.0.2)"
  echo "  minor  Create stable minor release   (e.g. v0.1.0 → v0.2.0)"
  echo "  major  Create stable major release   (e.g. v1.0.0 → v2.0.0)"
  exit 1
}

[[ $# -eq 1 ]] || usage

KIND="$1"
[[ "$KIND" =~ ^(rc|patch|minor|major)$ ]] || usage

# Fetch all version tags sorted by semver (descending)
echo "Fetching tags from GitHub..."
TAGS="$(git ls-remote --tags origin 'refs/tags/v*' 2>/dev/null \
  | sed 's|.*refs/tags/||' \
  | grep -v '\^{}' \
  | sort -t. -k1,1rn -k2,2rn -k3,3rn)"

# Find latest stable tag (no pre-release suffix)
LATEST_STABLE="$(echo "$TAGS" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"

if [[ -z "$LATEST_STABLE" ]]; then
  LATEST_STABLE="v0.0.0"
  echo "No stable releases found, starting from $LATEST_STABLE"
else
  echo "Latest stable release: $LATEST_STABLE"
fi

# Parse major.minor.patch from latest stable
IFS='.' read -r MAJOR MINOR PATCH <<< "${LATEST_STABLE#v}"

if [[ "$KIND" == "rc" ]]; then
  # Bump patch for the rc target version
  TARGET_PATCH=$((PATCH + 1))
  TARGET="v${MAJOR}.${MINOR}.${TARGET_PATCH}"

  # Find highest existing rc for this target
  LAST_RC="$(echo "$TAGS" | grep -E "^${TARGET}-rc[0-9]+$" | head -1 || true)"

  if [[ -z "$LAST_RC" ]]; then
    NEXT_TAG="${TARGET}-rc1"
  else
    RC_NUM="${LAST_RC##*-rc}"
    NEXT_TAG="${TARGET}-rc$((RC_NUM + 1))"
  fi
else
  case "$KIND" in
    patch) NEXT_TAG="v${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
    minor) NEXT_TAG="v${MAJOR}.$((MINOR + 1)).0" ;;
    major) NEXT_TAG="v$((MAJOR + 1)).0.0" ;;
  esac
fi

echo ""
echo "Next tag: $NEXT_TAG"
echo ""
read -rp "Tag and push $NEXT_TAG? [y/N] " CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

git tag "$NEXT_TAG"
git push origin "$NEXT_TAG"

echo ""
echo "Done! $NEXT_TAG pushed — GitHub Actions will build the release."
