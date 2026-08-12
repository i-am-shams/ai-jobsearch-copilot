#!/usr/bin/env bash
#
# Deployment entry point, run on the VPS by the CI/CD pipeline.
#
# This script is the ONLY thing the CD deploy key is permitted to run. That is
# enforced on the VPS by a forced command in ~/.ssh/authorized_keys:
#
#   restrict,command="/opt/jobcopilot/deploy.sh" ssh-ed25519 AAAA... github-actions-deploy
#
# ("restrict" implies no-pty, no-port-forwarding, no-agent-forwarding,
# no-X11-forwarding and no-user-rc, and keeps implying any new restrictions
# added in future OpenSSH releases - safer than listing options individually
# and then missing one that gets introduced later.)
#
# With that in place the key cannot open an interactive shell or run any other
# command, no matter what GitHub Actions sends. This matters more than usual
# here: a separate, live, unrelated production project shares this VPS, so a
# leaked GitHub secret must not become a general-purpose foothold on the box.
#
# Deployed to: /opt/jobcopilot/deploy.sh (chmod 750)

set -euo pipefail

COMPOSE_DIR="/opt/jobcopilot"
PUBLIC_URL="https://jobcopilot.dentflowbd.com"
CONTAINERS=(
  jobcopilot-postgres
  jobcopilot-rabbitmq
  jobcopilot-api
  jobcopilot-worker
  jobcopilot-frontend
)

cd "$COMPOSE_DIR"

echo "==> Pulling updated images"
docker compose pull

echo "==> Applying changes"
# Only containers whose image or config actually changed are recreated.
docker compose up -d

# Wait for a container to report healthy. Every service in this stack defines a
# healthcheck, so "running" is never treated as good enough - a container can be
# up while the app inside it is still starting, or already broken.
wait_for_healthy() {
  local name="$1"
  local timeout="${2:-180}"
  local elapsed=0
  local status=""

  while [ "$elapsed" -lt "$timeout" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$name" 2>/dev/null || echo missing)"
    case "$status" in
      healthy)
        echo "    $name: healthy (${elapsed}s)"
        return 0
        ;;
      missing)
        echo "    $name: container not found"
        return 1
        ;;
      no-healthcheck)
        echo "    $name: WARNING - no healthcheck defined, cannot verify"
        return 0
        ;;
    esac
    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "    $name: TIMED OUT after ${timeout}s (last status: ${status})"
  return 1
}

echo "==> Waiting for containers to report healthy"
for c in "${CONTAINERS[@]}"; do
  if ! wait_for_healthy "$c"; then
    echo "!! Deployment failed: $c did not become healthy. Last 50 log lines:"
    docker logs --tail 50 "$c" 2>&1 || true
    exit 1
  fi
done

# Smoke test over the real public URL, not just from inside Docker. This is the
# only check that exercises the whole path an actual user takes: DNS, TLS, the
# co-hosted project's outer nginx, this project's frontend nginx, then the API.
# Container health alone would still pass if, say, an nginx route broke.
#
# The BODY is asserted, not just the status code, and that distinction is not
# academic: the frontend nginx serves a SPA with a `try_files ... /index.html`
# fallback, so *every* unmatched path returns 200 with the app's HTML. A
# status-code-only check was verified to pass against a deployment that had no
# /health endpoint at all - it was matching the SPA fallback. Asserting the
# exact body is what makes this test mean anything.
echo "==> Public smoke test"
live_body="$(curl -sS --max-time 20 "${PUBLIC_URL}/health" 2>/dev/null || echo '')"
if [ "$live_body" != "Healthy" ]; then
  echo "!! Deployment failed: ${PUBLIC_URL}/health did not return the health endpoint."
  echo "   Expected body 'Healthy', got: $(printf '%.120s' "$live_body")"
  echo "   (A SPA-looking HTML body here means the /health nginx route is missing.)"
  exit 1
fi
echo "    liveness:  Healthy"

# Readiness is reported but deliberately NOT fatal. It depends on Postgres and
# RabbitMQ both accepting connections; failing the deploy on a transient
# dependency blip would roll a perfectly good release back for no reason. A
# genuinely broken dependency will be caught by the uptime monitor instead.
ready_body="$(curl -sS --max-time 20 "${PUBLIC_URL}/health/ready" 2>/dev/null || echo '')"
if [ "$ready_body" = "Healthy" ]; then
  echo "    readiness: Healthy"
else
  echo "    readiness: WARNING - not ready (got: $(printf '%.120s' "$ready_body"))"
fi

# Old image layers accumulate on every deploy and this VPS has finite disk that
# a live unrelated project also depends on. Only dangling images are removed -
# never volumes, and never with -a, which would delete images belonging to the
# co-hosted project simply because nothing was currently running from them.
echo "==> Pruning dangling images"
docker image prune -f

echo "==> Deployment complete"
