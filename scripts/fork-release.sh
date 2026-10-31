#!/usr/bin/env bash
# Publie une nouvelle version du fork : bump de version, tag, push.
# Le tag déclenche .github/workflows/fork-release.yml qui build et publie
# la release Windows ; les PC la récupèrent via la mise à jour auto.
# Usage : scripts/fork-release.sh [patch|minor|major]   (défaut : patch)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
    echo "Arbre de travail non propre : commit d'abord." >&2
    exit 1
fi

git pull --ff-only origin development
version=$(npm version "${1:-patch}" --no-git-tag-version)
git commit -qam "chore(release): $version"
git tag "$version"
git push origin development "$version"

echo "Release $version lancée : https://github.com/TimLaum/feishin/actions"
