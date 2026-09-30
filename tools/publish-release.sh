#!/bin/bash
# Publishes the staged packages.
# A full release publishes with --tag latest, then dist-tag points latest at
# that version. A prerelease publishes with --tag next, then dist-tag points
# next at that version.
# Allow npm dist-tag is its own trusted-publisher permission. npm publish does
# not grant it. The command needs npm 11.21.0 or newer.
set -euo pipefail

dry="${DRY_RUN:-false}"
pre="${RELEASE_PRERELEASE:-false}"

publish_one() {
  local dir="$1"
  local pkg ver view_out view_ec unpublished
  pkg=$(node -p "require('./$dir/package.json').name")
  ver=$(node -p "require('./$dir/package.json').version")
  if [ "$dry" = "true" ]; then
    if [ "$pre" = "true" ]; then
      npm publish "$dir" --access public --provenance --tag next --dry-run
      echo "dry-run: npm dist-tag add $pkg@$ver next"
    else
      npm publish "$dir" --access public --provenance --tag latest --dry-run
      echo "dry-run: npm dist-tag add $pkg@$ver latest"
    fi
    return
  fi
  view_out=""
  view_ec=0
  view_out="$(npm view "$pkg@$ver" version 2>&1)" && view_ec=0 || view_ec=$?
  if [ "$view_ec" -eq 0 ]; then
    echo "skip publish $pkg@$ver — already on registry"
  else
    # A missing version is code E404 plus the registry's own not-found line.
    # A 404 mentioned inside some other error is not enough.
    unpublished=0
    if echo "$view_out" | grep -q 'code E404' && echo "$view_out" | grep -Eq 'No match found for version|is not in this registry'; then
      unpublished=1
    fi
    if [ "$unpublished" -ne 1 ]; then
      echo "npm view $pkg@$ver failed with exit $view_ec — refusing to publish"
      echo "$view_out"
      exit 1
    fi
    if [ "$pre" = "true" ]; then
      echo "publish $pkg@$ver on next"
      npm publish "$dir" --access public --provenance --tag next
    else
      echo "publish $pkg@$ver on latest"
      npm publish "$dir" --access public --provenance --tag latest
    fi
  fi
  if [ "$pre" = "true" ]; then
    echo "point $pkg@$ver at next"
    npm dist-tag add "$pkg@$ver" next
  else
    echo "point $pkg@$ver at latest"
    npm dist-tag add "$pkg@$ver" latest
  fi
}

publish_one .release/frame
publish_one .release/tick
publish_one .release/host
publish_one .release/load
