#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
	echo "Error: ${ENV_FILE} not found."
	exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [[ -z "${VSCE_KEY:-}" ]]; then
	echo "Error: VSCE_KEY is not set in ${ENV_FILE}."
	exit 1
fi

cd "${ROOT_DIR}"
bunx @vscode/vsce publish -p "${VSCE_KEY}"
