#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy the checked-out project to the Ubuntu host's Nginx and systemd setup.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/demo-v1.adhyayaan.com}"
SERVICE_NAME="${SERVICE_NAME:-adhyayaan}"
API_PORT="${API_PORT:-3000}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "$REPO_ROOT"

if [[ "$(id -un)" == "root" ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

for command in git pnpm node; do
  command -v "$command" >/dev/null || { echo "Required command not found: $command" >&2; exit 1; }
done
command -v rsync >/dev/null || { echo "Required command not found: rsync (install with: sudo apt install rsync)" >&2; exit 1; }

echo "Updating $DEPLOY_BRANCH from origin..."
git fetch origin "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

echo "Installing locked dependencies..."
pnpm install --frozen-lockfile

echo "Building frontend..."
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/adhyayaan build

echo "Building API..."
pnpm --filter @workspace/api-server build

echo "Publishing frontend to $WEB_ROOT..."
"${SUDO[@]}" install -d -o www-data -g www-data "$WEB_ROOT"
"${SUDO[@]}" rsync -a --delete --chown=www-data:www-data \
  "$REPO_ROOT/artifacts/adhyayaan/dist/public/" "$WEB_ROOT/"

echo "Restarting $SERVICE_NAME..."
"${SUDO[@]}" systemctl restart "$SERVICE_NAME"
"${SUDO[@]}" systemctl is-active --quiet "$SERVICE_NAME" || {
  "${SUDO[@]}" journalctl -u "$SERVICE_NAME" -n 60 --no-pager
  exit 1
}

echo "Checking API health..."
for attempt in {1..15}; do
  if curl --fail --silent "http://127.0.0.1:${API_PORT}/api/healthz" >/dev/null; then
    echo "Deployment completed successfully."
    exit 0
  fi
  sleep 2
done

echo "API health check failed; recent service logs:" >&2
"${SUDO[@]}" journalctl -u "$SERVICE_NAME" -n 60 --no-pager
exit 1
