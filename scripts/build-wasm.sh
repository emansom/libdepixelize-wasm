#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CPP_DIR="$PROJECT_DIR/cpp"
BUILD_DIR="$CPP_DIR/build"

echo "=== libdepixelize-wasm build ==="

# Ensure each vendor submodule is cloned (recovery if broken)
ensure_vendor() {
    local submod="$1" url="$2"
    local submod_path="cpp/vendor/$submod"
    local submod_dir="$CPP_DIR/vendor/$submod"

    # Configure submodule URL and shallow clone
    git -C "$PROJECT_DIR" config "submodule.${submod_path}.url" "$url"
    git -C "$PROJECT_DIR" config "submodule.${submod_path}.shallow" true

    if [ ! -f "$submod_dir/CMakeLists.txt" ]; then
        echo "  Recovering $submod..."

        # Error if local modifications exist
        if [ -d "$submod_dir/.git" ] || [ -f "$submod_dir/.git" ]; then
            if [ -n "$(git -C "$submod_dir" status --porcelain 2>/dev/null)" ]; then
                echo "Error: $submod has local modifications. Commit or discard changes first."
                exit 1
            fi
        fi

        # Full cleanup: deinit, remove git module cache, remove local copy
        git -C "$PROJECT_DIR" submodule deinit -f "$submod_path" 2>/dev/null || true
        rm -rf "$PROJECT_DIR/.git/modules/$submod_path"
        rm -rf "$submod_dir"

        # Re-initialize from scratch
        git -C "$PROJECT_DIR" submodule init "$submod_path"
        git -C "$PROJECT_DIR" submodule update --depth 1 "$submod_path"

        if [ ! -f "$submod_dir/CMakeLists.txt" ]; then
            echo "Error: Failed to initialize submodule $submod"
            exit 1
        fi
    fi
}

echo "--- Ensuring vendor submodules ---"
ensure_vendor double-conversion https://github.com/google/double-conversion.git
ensure_vendor gsl               https://github.com/ampl/gsl.git
ensure_vendor lib2geom           https://gitlab.com/inkscape/lib2geom.git
ensure_vendor libdepixelize      https://gitlab.com/inkscape/devel/libdepixelize.git

# Check for Emscripten, try common locations
if ! command -v emcmake &> /dev/null; then
    # Try sourcing emsdk_env.sh from known locations
    EMSDK_LOCATIONS=(
        "${EMSDK:-}/emsdk_env.sh"           # $EMSDK env var (official installer)
        "$HOME/emsdk/emsdk_env.sh"           # Common user install
        "/usr/bin/emsdk_env.sh"              # Arch Linux AUR emsdk package
        "/usr/lib/emsdk/emsdk_env.sh"        # Arch Linux AUR emsdk (actual)
        "/opt/emsdk/emsdk_env.sh"            # System-wide manual install
        "/usr/local/emsdk/emsdk_env.sh"      # Alternative system-wide
        "/emsdk/emsdk_env.sh"                # Docker emscripten/emsdk image
    )
    for emsdk_env in "${EMSDK_LOCATIONS[@]}"; do
        if [ -f "$emsdk_env" ]; then
            echo "--- Sourcing $emsdk_env ---"
            source "$emsdk_env"
            break
        fi
    done
fi
# Arch Linux pacman package: tools in /usr/lib/emscripten (no emsdk_env.sh)
if ! command -v emcmake &> /dev/null && [ -d "/usr/lib/emscripten" ]; then
    export PATH="/usr/lib/emscripten:$PATH"
fi

if ! command -v emcmake &> /dev/null; then
    echo "Error: Emscripten not found. Please install and activate emsdk."
    echo "  https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

# Copy vendor sources to temp directory so patches don't modify submodules
VENDOR_TMP="$(mktemp -d)"
trap 'rm -rf "$VENDOR_TMP"' EXIT
echo "--- Copying vendor sources to $VENDOR_TMP ---"
cp -a "$CPP_DIR/vendor/." "$VENDOR_TMP/"

# Pin each dependency to its exact version in the temp copy
# Uses git archive to extract from .git/modules/ — no working tree modifications
pin_vendor() {
    local submod="$1" ref="$2"
    local git_dir="$PROJECT_DIR/.git/modules/cpp/vendor/$submod"
    local temp_dir="$VENDOR_TMP/$submod"

    # Fetch the exact ref if not in the shallow clone
    if ! git --git-dir="$git_dir" cat-file -e "$ref" 2>/dev/null; then
        git --git-dir="$git_dir" fetch --depth 1 origin "$ref" --quiet
    fi

    # Extract pinned version into temp (replaces cp'd files, no side effects)
    rm -rf "$temp_dir"
    mkdir -p "$temp_dir"
    git --git-dir="$git_dir" archive "$ref" | tar -xC "$temp_dir"
    echo "  $submod → $ref"
}

echo "--- Pinning vendor versions ---"
pin_vendor double-conversion v3.4.0
pin_vendor gsl               fb0cfbc82b5e9e4d22444efce9241924f4aefb83
pin_vendor lib2geom           b1273d10b17f7c0fa23016c12477577ce667b8cf
pin_vendor libdepixelize      73b07a45f01cf7c4b179d1e65cef22609e000419

# Apply patches to the temp copy
echo "--- Applying patches ---"

apply_patch() {
    local target_dir="$1"
    local patch_file="$2"
    patch -p1 -N -d "$target_dir" < "$patch_file"
    echo "  Applied: $(basename "$patch_file")"
}

apply_patch "$VENDOR_TMP/lib2geom" "$CPP_DIR/patches/lib2geom-emscripten.patch"

# Configure
echo "--- Configuring ---"
rm -rf "$BUILD_DIR"
emcmake cmake -S "$CPP_DIR" -B "$BUILD_DIR" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DVENDOR_DIR="$VENDOR_TMP"

# Build
echo "--- Building ---"
emmake cmake --build "$BUILD_DIR" --target depixelize_wasm depixelize_browser -j "$(nproc 2>/dev/null || echo 4)"

echo "--- Done ---"
if [ -f "$PROJECT_DIR/wasm/depixelize.js" ] && [ -f "$PROJECT_DIR/wasm/depixelize.wasm" ] && [ -f "$PROJECT_DIR/wasm/depixelize.browser.js" ]; then
    echo "Output:"
    ls -lh "$PROJECT_DIR/wasm/depixelize.js" "$PROJECT_DIR/wasm/depixelize.wasm" "$PROJECT_DIR/wasm/depixelize.browser.js"
else
    echo "Error: Output files not found in wasm/"
    exit 1
fi
