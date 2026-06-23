#!/usr/bin/env bash
# One-time model compression: assets-src/*.glb -> public/models/*.glb
# Meshopt + quantization. No simplification (the head close-up is the hero shot).
# Head normals kept at 12-bit: 8/10-bit octahedral normals band on smooth marble curvature.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/models
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Head: explicit quantization bits, then meshopt
npx gltf-transform quantize \
  assets-src/head_of_michelangelos_david_optimised_fixed.glb \
  "$TMP/head-q.glb" \
  --quantize-position 14 --quantize-normal 12
npx gltf-transform meshopt "$TMP/head-q.glb" public/models/head.glb

# Glasses: full optimize, but no palette (material identity must survive for
# per-material sampling quotas) and no simplification
npx gltf-transform optimize \
  assets-src/plastic_sunglasses.glb \
  public/models/glasses.glb \
  --compress meshopt --simplify false --texture-compress false --palette false

ls -lh public/models/
