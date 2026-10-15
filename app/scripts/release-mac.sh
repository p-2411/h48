#!/usr/bin/env bash
# Builds, signs, notarises and publishes Duet for macOS, at the version in package.json, to the
# releases repo (electron-builder.yml › publish). Installed copies pick it up within a few hours
# (src/main/updates). No credentials live in the repo or in env vars:
#   - signing: the "Developer ID Application" certificate in the login keychain;
#   - notarising: a notarytool keychain profile, saved once (app/README.md › Releasing);
#   - publishing: the GitHub CLI's login (gh auth login), or GH_TOKEN if set.
# Run from app/: npm run release:mac
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${DUET_NOTARY_PROFILE:-duet-notary}"
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

fail() {
  echo "release: $*" >&2
  exit 1
}

[[ "$(uname)" == Darwin ]] || fail "macOS releases are built on a Mac."
[[ -z "$(git status --porcelain -- .)" ]] || fail "commit or set aside your changes in app/ first: a release is built from a clean tree."
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && fail "$TAG is already released. Bump the version first (npm version patch --no-git-tag-version), and commit it."
security find-identity -v -p codesigning | grep -q "Developer ID Application" ||
  fail "no Developer ID Application certificate in the keychain."
xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1 ||
  fail "no notarytool profile '$PROFILE'. Save it once: xcrun notarytool store-credentials $PROFILE (see app/README.md › Releasing)."
if [[ -z "${GH_TOKEN:-}" ]]; then
  GH_TOKEN="$(gh auth token 2>/dev/null)" || fail "log in to GitHub first (gh auth login), or set GH_TOKEN."
fi

echo "release: Duet $VERSION: checking, testing and building"
npm run typecheck
npm run lint
npm test
npx electron-vite build
# A fresh dist/, so the checks below look at this build. Uploaded as a draft (electron-builder.yml ›
# releaseType), which installed copies can't see yet.
rm -rf dist
APPLE_KEYCHAIN_PROFILE="$PROFILE" GH_TOKEN="$GH_TOKEN" npx electron-builder --mac --publish always

# The app must pass Gatekeeper as a notarised Developer ID app, or it won't open or update. Only then
# is the draft published, and installed copies find it.
APP="dist/mac-arm64/Duet.app"
[[ -d "$APP" ]] || fail "no $APP: the build made something else."
spctl --assess --type execute --verbose=2 "$APP" ||
  fail "Gatekeeper refused $APP. The release stays a draft: delete it at https://github.com/p-2411/duet-releases/releases"
xcrun stapler validate "$APP" ||
  fail "$APP has no notarisation ticket. The release stays a draft: delete it at https://github.com/p-2411/duet-releases/releases"
GH_TOKEN="$GH_TOKEN" gh release edit "$TAG" --repo p-2411/duet-releases --draft=false --latest

git tag "$TAG"
git push origin "$TAG"
echo "release: Duet $VERSION is published: https://github.com/p-2411/duet-releases/releases/tag/$TAG"
