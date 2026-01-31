#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/package.json" ]]; then
  echo "[错误] 未找到 package.json，请在项目根目录运行。"
  exit 1
fi

if [[ ! -d "${ROOT_DIR}/frontend" ]]; then
  echo "[错误] 未找到 frontend 目录。"
  exit 1
fi

echo "[1/2] 编译合约"
cd "${ROOT_DIR}"
"${ROOT_DIR}/node_modules/.bin/hardhat" compile

echo "[2/2] 启动前端开发服务器"
cd "${ROOT_DIR}/frontend"
"${ROOT_DIR}/frontend/node_modules/.bin/next" dev
