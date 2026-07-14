#!/usr/bin/env bash
# Push current branch to Gitee and print Pages setup steps.
# Usage:
#   export GITEE_USER=your_gitee_username
#   export GITEE_TOKEN=your_private_token   # optional if SSH already works
#   ./scripts/deploy-gitee.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REPO_NAME="${GITEE_REPO_NAME:-Git-design}"
USER_NAME="${GITEE_USER:-}"

if [[ -z "$USER_NAME" ]]; then
  echo "Please set GITEE_USER to your Gitee username, e.g.:"
  echo "  export GITEE_USER=yourname"
  exit 1
fi

if git remote get-url gitee >/dev/null 2>&1; then
  echo "Using existing remote: gitee"
else
  if [[ -n "${GITEE_TOKEN:-}" ]]; then
    git remote add gitee "https://${GITEE_TOKEN}@gitee.com/${USER_NAME}/${REPO_NAME}.git"
  else
    git remote add gitee "https://gitee.com/${USER_NAME}/${REPO_NAME}.git"
  fi
  echo "Added remote gitee -> https://gitee.com/${USER_NAME}/${REPO_NAME}.git"
fi

echo "Pushing ${BRANCH} to gitee..."
git push -u gitee "HEAD:refs/heads/${BRANCH}"

cat <<EOF

Push finished.

Enable Gitee Pages (国内访问):
1. Open https://gitee.com/${USER_NAME}/${REPO_NAME}/pages
2. Deployment branch: ${BRANCH}
3. Deployment directory: / (root)
4. Click start / update
5. Site URL will look like:
   https://${USER_NAME}.gitee.io/${REPO_NAME}/

EOF
