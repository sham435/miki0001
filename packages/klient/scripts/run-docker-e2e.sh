#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${PACKAGE_DIR}/../.." && pwd)"

workspace_slug="$(
  basename -- "${REPO_ROOT}" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs 'a-z0-9_.-' '-' \
    | sed -e 's/^[^a-z0-9]*//' -e 's/[^a-z0-9]*$//' \
    | cut -c1-48
)"
if [[ -z "${workspace_slug}" ]]; then
  workspace_slug="workspace"
fi
workspace_hash="$(printf '%s' "${REPO_ROOT}" | cksum | awk '{print $1}')"
RUN_ID="${MIKI_SERVER_E2E_RUN_ID:-${workspace_slug}-${workspace_hash}}"

BASE_IMAGE="${MIKI_SERVER_E2E_BASE_IMAGE:-miki-server-e2e-base:${RUN_ID}}"
IMAGE="${MIKI_SERVER_E2E_IMAGE:-miki-server-e2e:${RUN_ID}}"
CONTAINER="${MIKI_SERVER_E2E_CONTAINER:-miki-server-e2e-${RUN_ID}}"
STATE_ROOT="${MIKI_SERVER_E2E_STATE_ROOT:-${HOME}/.miki-code-server-dev}"
PORT="${MIKI_SERVER_E2E_PORT:-58627}"

MIKI_HOME_HOST="${MIKI_SERVER_E2E_MIKI_HOME_HOST:-${STATE_ROOT}/docker-e2e/${RUN_ID}/miki-code-home}"
MIKI_HOME_CONTAINER="/data/docker-e2e/miki-code-home"
SEED_HOME_HOST="${MIKI_SERVER_E2E_SEED_MIKI_HOME_HOST:-${STATE_ROOT}/miki-home/miki-code-home}"

if [[ -n "${MIKI_SERVER_E2E_REPORT_DIR_HOST:-}" ]]; then
  REPORT_DIR_HOST="${MIKI_SERVER_E2E_REPORT_DIR_HOST}"
  REPORT_ROOT_HOST="$(dirname -- "${REPORT_DIR_HOST}")"
  REPORT_DIR_NAME="$(basename -- "${REPORT_DIR_HOST}")"
else
  REPORT_ROOT_HOST="${MIKI_SERVER_E2E_REPORT_ROOT_HOST:-${STATE_ROOT}/server-e2e-reports/docker/${RUN_ID}}"
  REPORT_DIR_NAME="latest"
  REPORT_DIR_HOST="${REPORT_ROOT_HOST}/${REPORT_DIR_NAME}"
fi
REPORT_ROOT_CONTAINER="/data/server-e2e-reports/docker"
REPORT_DIR_CONTAINER="${REPORT_ROOT_CONTAINER}/${REPORT_DIR_NAME}"
TMPDIR_CONTAINER="/data/docker-e2e/tmp"

NM_ROOT="${STATE_ROOT}/docker-e2e/${RUN_ID}/nm"

workspace_node_modules=(
  "root:/workspace/miki-code/node_modules"
  "apps_miki-code:/workspace/miki-code/apps/miki-code/node_modules"
  "apps_miki-web:/workspace/miki-code/apps/miki-web/node_modules"
  "apps_vis:/workspace/miki-code/apps/vis/node_modules"
  "apps_vis_server:/workspace/miki-code/apps/vis/server/node_modules"
  "apps_vis_web:/workspace/miki-code/apps/vis/web/node_modules"
  "docs:/workspace/miki-code/docs/node_modules"
  "pkg_kap-server:/workspace/miki-code/packages/kap-server/node_modules"
  "pkg_server-e2e:/workspace/miki-code/packages/klient/node_modules"
  "pkg_kosong:/workspace/miki-code/packages/kosong/node_modules"
  "pkg_migration-legacy:/workspace/miki-code/packages/migration-legacy/node_modules"
  "pkg_node-sdk:/workspace/miki-code/packages/node-sdk/node_modules"
  "pkg_oauth:/workspace/miki-code/packages/oauth/node_modules"
  "pkg_protocol:/workspace/miki-code/packages/protocol/node_modules"
  "pkg_services:/workspace/miki-code/packages/services/node_modules"
  "pkg_telemetry:/workspace/miki-code/packages/telemetry/node_modules"
)

mkdir -p "${STATE_ROOT}" "${MIKI_HOME_HOST}" "${REPORT_DIR_HOST}" "${NM_ROOT}"
for mount in "${workspace_node_modules[@]}"; do
  mkdir -p "${NM_ROOT}/${mount%%:*}"
done

# Seed only auth/config into the isolated docker-e2e home. Never copy server
# locks, sessions, uploaded files, or reports from the compose server home.
if [[ -f "${SEED_HOME_HOST}/config.toml" && ! -f "${MIKI_HOME_HOST}/config.toml" ]]; then
  cp "${SEED_HOME_HOST}/config.toml" "${MIKI_HOME_HOST}/config.toml"
fi
if [[ -d "${SEED_HOME_HOST}/credentials" && ! -d "${MIKI_HOME_HOST}/credentials" ]]; then
  cp -R "${SEED_HOME_HOST}/credentials" "${MIKI_HOME_HOST}/credentials"
fi

if [[ "${MIKI_SERVER_E2E_SKIP_BUILD:-0}" != "1" ]]; then
  docker build -t "${BASE_IMAGE}" -f "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}"
  docker build \
    -t "${IMAGE}" \
    -f "${PACKAGE_DIR}/Dockerfile" \
    --build-arg "BASE_IMAGE=${BASE_IMAGE}" \
    "${REPO_ROOT}"
fi

docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true

read -r -d '' container_script <<'EOS' || true
set -euo pipefail

cd /workspace/miki-code
mkdir -p "${MIKI_CODE_HOME}/server" "${MIKI_SERVER_E2E_REPORT_DIR}" "${TMPDIR}" /data/server-e2e-reports/docker
rm -f "${MIKI_CODE_HOME}/server/lock"

if [[ ! -e /workspace/miki-code/node_modules/.modules.yaml || ! -e /workspace/miki-code/packages/klient/node_modules/ws ]]; then
  echo "[server-e2e:docker] installing pnpm deps"
  pnpm install --frozen-lockfile
else
  echo "[server-e2e:docker] pnpm deps already present"
fi

server_log="/data/server-e2e-reports/docker/server.log"
: > "${server_log}"

echo "[server-e2e:docker] starting server on container-local ${MIKI_SERVER_URL}"
pnpm dev:server -- \
  --host 127.0.0.1 \
  --port "${MIKI_SERVER_E2E_PORT}" \
  --log-level debug \
  --debug-endpoints \
  >"${server_log}" 2>&1 &
server_pid=$!

cleanup() {
  status=$?
  if kill -0 "${server_pid}" >/dev/null 2>&1; then
    kill "${server_pid}" >/dev/null 2>&1 || true
    wait "${server_pid}" >/dev/null 2>&1 || true
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

ready=0
for attempt in $(seq 1 90); do
  if curl -fsS "${MIKI_SERVER_URL}/api/v1/meta" >/tmp/server-meta.json 2>/tmp/server-curl.err; then
    ready=1
    echo "[server-e2e:docker] server ready: $(cat /tmp/server-meta.json)"
    break
  fi
  if ! kill -0 "${server_pid}" >/dev/null 2>&1; then
    echo "[server-e2e:docker] server exited before readiness" >&2
    tail -n 200 "${server_log}" >&2 || true
    exit 1
  fi
  sleep 1
done

if [[ "${ready}" != "1" ]]; then
  echo "[server-e2e:docker] server did not become ready within 90s" >&2
  cat /tmp/server-curl.err >&2 || true
  tail -n 200 "${server_log}" >&2 || true
  exit 1
fi

cd /workspace/miki-code/packages/klient
pnpm test
EOS

docker_args=(
  run
  --rm
  --init
  --name "${CONTAINER}"
  --workdir /workspace/miki-code/packages/klient
  --env "MIKI_CODE_HOME=${MIKI_HOME_CONTAINER}"
  --env "MIKI_SERVER_E2E_PORT=${PORT}"
  --env "MIKI_SERVER_URL=http://127.0.0.1:${PORT}"
  --env "MIKI_SERVER_E2E_REPORT_DIR=${REPORT_DIR_CONTAINER}"
  --env "TMPDIR=${TMPDIR_CONTAINER}"
  --env "TERM=xterm-256color"
  --env "TZ=Asia/Shanghai"
  --env "npm_config_store_dir=/workspace/miki-code/node_modules/.pnpm-store"
  --env "npm_config_package_import_method=copy"
  --volume "${REPO_ROOT}:/workspace/miki-code:ro"
  --volume "${MIKI_HOME_HOST}:${MIKI_HOME_CONTAINER}"
  --volume "${REPORT_ROOT_HOST}:${REPORT_ROOT_CONTAINER}"
)

for mount in "${workspace_node_modules[@]}"; do
  docker_args+=(--volume "${NM_ROOT}/${mount%%:*}:${mount#*:}")
done

echo "[server-e2e:docker] running ${IMAGE} without host port publishing"
set +e
docker "${docker_args[@]}" "${IMAGE}" bash -lc "${container_script}"
status=$?
set -e

echo "[server-e2e:docker] report: ${REPORT_DIR_HOST}/index.html"
echo "[server-e2e:docker] server log: ${REPORT_ROOT_HOST}/server.log"
exit "${status}"
