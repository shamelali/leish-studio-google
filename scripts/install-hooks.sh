#!/bin/sh
# Links scripts/git-hooks/* into .git/hooks (one-time per clone).
set -e
ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$ROOT/.git/hooks"
for hook in "$ROOT"/scripts/git-hooks/*; do
  name="$(basename "$hook")"
  ln -sf "$hook" "$ROOT/.git/hooks/$name"
  chmod +x "$ROOT/.git/hooks/$name"
  echo "installed hook: $name"
done
