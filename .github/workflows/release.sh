#!/usr/bin/env bash
set -eu

TAG=$1

# Remove the leading "v" from the tag
VERSION=${TAG#v}


# Extract relevant section from changelog
CHANGELOG=$(awk -v version="$VERSION" '
    $0 ~ "^## \\[" version "\\]" {print_it = 1} 
    print_it && /^## / && $0 !~ "^## \\[" version "\\]" {exit}
    print_it {print}
    ' "CHANGELOG.md")

# Abort if empty
if [ -z "$CHANGELOG" ]; then
    echo "No matching changelog section found!"
    exit 1
fi

gh release create "${TAG}" \
    --title "${TAG}" \
    ./*"${VERSION}".vsix \
    -n "$CHANGELOG"