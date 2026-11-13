#!/usr/bin/env bash
set -e

echo "======================================================"
echo " MyRoom 3D Engine Installer"
echo " (FFmpeg + COLMAP + DUSt3R + OpenSplat / Nerfstudio)"
echo "======================================================"

OS_NAME="$(uname -s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$SERVER_DIR/bin"
mkdir -p "$BIN_DIR"

if [ "$OS_NAME" = "Darwin" ]; then
  echo "[1/4] macOS 감지 — Homebrew로 colmap, cmake, ffmpeg 설치..."
  if command -v brew >/dev/null 2>&1; then
    brew install colmap cmake ffmpeg opencv || true
  fi
elif [ "$OS_NAME" = "Linux" ]; then
  echo "[1/4] Linux 감지 — apt로 colmap, cmake, ffmpeg 설치..."
  sudo apt-get update
  sudo apt-get install -y git cmake build-essential colmap ffmpeg libopencv-dev python3-pip
fi

echo "[2/4] Python 기본 패키지 설치..."
pip3 install -r "$SERVER_DIR/requirements.txt"

echo "[3/4] (선택) Nerfstudio (splatfacto) 설치 시:"
echo "  pip3 install nerfstudio"

echo "[4/4] (선택) OpenSplat 빌드 및 DUSt3R 설치 안내:"
echo "  - OpenSplat: git clone https://github.com/pierotofy/OpenSplat && mkdir OpenSplat/build && cd OpenSplat/build && cmake .. && make -j && cp opensplat $BIN_DIR/"
echo "  - DUSt3R: git clone --recursive https://github.com/naver/dust3r && pip3 install -r dust3r/requirements.txt"
