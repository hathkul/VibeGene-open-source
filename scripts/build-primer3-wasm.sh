#!/usr/bin/env bash
# Builds primer3_core (Primer3 v2.6.1) to a single-file ES module at src/wasm/primer3/primer3.mjs.
# Requires Emscripten (emcc/em++) on PATH; Homebrew's /opt/homebrew/bin is added automatically.
set -euo pipefail

PRIMER3_VERSION='2.6.1'
PRIMER3_URL="https://github.com/primer3-org/primer3/archive/refs/tags/v${PRIMER3_VERSION}.tar.gz"
PRIMER3_SHA256='805cef7ef39607cd40f0f5bb8b32e35e20007153a0a55131dd430ce644c8fb9e'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${PRIMER3_CACHE_DIR:-${ROOT_DIR}/.cache/primer3}"
OUT_DIR="${ROOT_DIR}/src/wasm/primer3"
TARBALL="${CACHE_DIR}/primer3-${PRIMER3_VERSION}.tar.gz"
BUILD_DIR="${CACHE_DIR}/build"
SRC_DIR="${BUILD_DIR}/primer3-${PRIMER3_VERSION}/src"
OBJ_DIR="${BUILD_DIR}/obj"

if [[ -d /opt/homebrew/bin ]]; then
  export PATH="/opt/homebrew/bin:${PATH}"
fi

for tool in emcc em++ curl tar; do
  if ! command -v "${tool}" > /dev/null; then
    echo "error: ${tool} not found on PATH" >&2
    exit 1
  fi
done

sha256_of() {
  if command -v sha256sum > /dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mkdir -p "${CACHE_DIR}"
if [[ ! -f "${TARBALL}" ]] || [[ "$(sha256_of "${TARBALL}")" != "${PRIMER3_SHA256}" ]]; then
  echo "Downloading ${PRIMER3_URL}"
  curl -fL --retry 3 -o "${TARBALL}.part" "${PRIMER3_URL}"
  mv "${TARBALL}.part" "${TARBALL}"
fi

ACTUAL_SHA256="$(sha256_of "${TARBALL}")"
if [[ "${ACTUAL_SHA256}" != "${PRIMER3_SHA256}" ]]; then
  echo "error: sha256 mismatch for ${TARBALL}" >&2
  echo "  expected ${PRIMER3_SHA256}" >&2
  echo "  actual   ${ACTUAL_SHA256}" >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${OBJ_DIR}"
tar -xzf "${TARBALL}" -C "${BUILD_DIR}"

echo "Using $(emcc --version | head -n 1)"

C_SOURCES=(
  primer3_boulder_main.c
  format_output.c
  read_boulder.c
  print_boulder.c
  dpal.c
  thal.c
  thal_parameters.c
  oligotm.c
  p3_seq_lib.c
  masker.c
)
CXX_SOURCES=(libprimer3.cc)

COMMON_FLAGS=(-O3 -Wno-unused-but-set-variable -Wno-unused-variable -Wno-deprecated-non-prototype -Wno-tautological-pointer-compare)

OBJECTS=()
for source in "${C_SOURCES[@]}"; do
  object="${OBJ_DIR}/${source%.c}.o"
  emcc -c "${COMMON_FLAGS[@]}" -o "${object}" "${SRC_DIR}/${source}"
  OBJECTS+=("${object}")
done
for source in "${CXX_SOURCES[@]}"; do
  object="${OBJ_DIR}/${source%.cc}.o"
  em++ -c "${COMMON_FLAGS[@]}" -std=c++11 -o "${object}" "${SRC_DIR}/${source}"
  OBJECTS+=("${object}")
done

mkdir -p "${OUT_DIR}"
em++ -O3 -o "${OUT_DIR}/primer3.mjs" "${OBJECTS[@]}" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createPrimer3Module \
  -sINVOKE_RUN=0 \
  -sEXIT_RUNTIME=1 \
  -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=1MB \
  -sSINGLE_FILE=1 \
  -sENVIRONMENT=web,worker,node \
  -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  --embed-file "${SRC_DIR}/humrep_and_simple.txt@/primer3_libs/humrep_and_simple.txt"

cp "${SRC_DIR}/LICENSE" "${OUT_DIR}/LICENSE"

echo "Wrote ${OUT_DIR}/primer3.mjs ($(wc -c < "${OUT_DIR}/primer3.mjs" | tr -d ' ') bytes)"
