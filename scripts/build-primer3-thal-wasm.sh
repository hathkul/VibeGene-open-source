#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARBALL="${ROOT_DIR}/.cache/primer3/primer3-2.6.1.tar.gz"
EXPECTED_SHA256='805cef7ef39607cd40f0f5bb8b32e35e20007153a0a55131dd430ce644c8fb9e'
OUT_DIR="${ROOT_DIR}/src/wasm/primer3-thal"
if [[ -d /opt/homebrew/bin ]]; then export PATH="/opt/homebrew/bin:${PATH}"; fi
export EM_CACHE="${EM_CACHE:-${ROOT_DIR}/.cache/emscripten}"
for tool in emcc shasum tar; do command -v "${tool}" >/dev/null || { echo "error: ${tool} not found" >&2; exit 1; }; done
[[ -f "${TARBALL}" ]] || { echo "error: pinned source tarball missing at ${TARBALL}" >&2; exit 1; }
ACTUAL_SHA256="$(shasum -a 256 "${TARBALL}" | awk '{print $1}')"
[[ "${ACTUAL_SHA256}" == "${EXPECTED_SHA256}" ]] || { echo "error: SHA-256 mismatch for ${TARBALL}" >&2; exit 1; }
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/primer3-thal-build.XXXXXX")"
trap 'rm -rf "${BUILD_DIR}"' EXIT
tar -xzf "${TARBALL}" -C "${BUILD_DIR}"
SRC_DIR="${BUILD_DIR}/primer3-2.6.1/src"
mkdir -p "${OUT_DIR}"
emcc -O3 -I"${SRC_DIR}" -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPrimer3ThalModule \
  -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1MB \
  -sSINGLE_FILE=1 \
  -sEXPORTED_FUNCTIONS='["_primer3_thal_align","_primer3_thal_free","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToUTF8","lengthBytesUTF8"]' \
  -o "${OUT_DIR}/primer3-thal.mjs" \
  "${OUT_DIR}/adapter.c" "${SRC_DIR}/thal.c" "${SRC_DIR}/thal_parameters.c" -lm
cp "${BUILD_DIR}/primer3-2.6.1/LICENSE" "${OUT_DIR}/LICENSE"
echo "Wrote ${OUT_DIR}/primer3-thal.mjs"
